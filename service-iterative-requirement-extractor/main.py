"""
Iterative Requirement Extractor
===============================
Extracts requirements from tender documents indexed in Qdrant.
Fetches chunks for a given `ANALYSIS_ID`, filters by `category='tender'`,
extracts requirements using OpenAI, and stores them in Supabase.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - OPENAI_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - ANALYSIS_ID
"""

import os
import sys
import json
import uuid
import logging
from typing import List, Literal, Optional, Dict, Any

from dotenv import load_dotenv
from supabase import create_client, Client
from qdrant_client import QdrantClient
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
import warnings

# Suppress Pydantic internal serialization warnings (harmless noise from LangChain)
warnings.filterwarnings("ignore", message=".*PydanticSerializationUnexpectedValue.*")

# Try to import shared logger
try:
    from supabase_logger import setup_logger, log_event, mark_failed
except ImportError:
    # Fallback for local testing
    def setup_logger(name):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(handler)
        return logger
    def log_event(supabase, analysis_id, level, message, source, details=None):
        print(f"[{level.upper()}] {source}: {message}")
    def mark_failed(supabase, analysis_id, message, source):
        print(f"[FAILED] {source}: {message}")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EVENT_SOURCE = "ACA: service-iterative-requirement-extractor"

# Load env vars
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

logger = setup_logger("requirement-extractor")

# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class Requirement(BaseModel):
    """Represents a single extracted requirement."""
    id: Optional[str] = Field(description="Internal ID if present in text, else None.", default=None)
    category: str = Field(description="One of: 'Technical', 'Administrative', 'Legal', 'Financial', 'Other'.")
    text: str = Field(description="The full text of the obligation.")
    mandatory: bool = Field(description="True if it uses 'must', 'shall', 'obligatorio'.")
    rag_chunk_id: Optional[str] = Field(description="ID of the source RAG chunk.", default=None)

class RawRequirementsList(BaseModel):
    """Temporary list for raw extraction from chunks."""
    requirements: List[Requirement]

# ---------------------------------------------------------------------------
# Core Logic
# ---------------------------------------------------------------------------

class IterativeExtractor:
    def __init__(self, model_name: str = "gpt-5-mini"):
        # We use a cheaper model for the Map phase and a stronger one for Reduce
        self.map_llm = ChatOpenAI(model=model_name, temperature=0)
        self.reduce_llm = ChatOpenAI(model="gpt-5.2-pro", temperature=0)

    def _extract_from_chunk(self, chunk_text: str) -> List[Requirement]:
        """Extracts requirements from a single text block."""
        structured_llm = self.map_llm.with_structured_output(RawRequirementsList)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract all explicit obligations from this tender fragment. If no requirements are found, return an empty list. STRICTLY OUTPUT IN SPANISH."),
            ("human", "{chunk}")
        ])
        
        chain = prompt | structured_llm
        result = chain.invoke({"chunk": chunk_text})
        return result.requirements

    def _consolidate_requirements(self, all_raw_reqs: List[Requirement]) -> List[dict]:
        """Deduplicates and merges requirements that are split across chunks."""
        if not all_raw_reqs:
            return []
            
        logger.info(f"Consolidating {len(all_raw_reqs)} raw findings...")
        
        # We serialize to pass to the LLM for consolidation
        raw_data = json.dumps([r.model_dump() for r in all_raw_reqs], ensure_ascii=False)
        
        system_prompt = """You are a master auditor. You will receive a list of requirements extracted from different parts of a tender.
        Tasks:
        1. Remove exact duplicates.
        2. Merge requirements that are split or overlapping.
        3. Assign a unique, consistent ID (e.g., REQ-001, REQ-002...).
        4. Ensure the text is complete and clear.
        5. CRITICAL: Keep descriptions concise (max 50 words each).
        6. CRITICAL: ALL OUTPUT MUST BE IN SPANISH (ESPAÑOL).
        7. CRITICAL: Preserve the `rag_chunk_id` from the source. If merging, keep the ID of the most relevant source.
        """
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Consolidate this raw list into a clean master list:\n\n{raw_list}")
        ])
        
        # We invoke gpt-4o for high-quality merging logic
        structured_llm = self.reduce_llm.with_structured_output(RawRequirementsList)
        chain = prompt | structured_llm
        
        # If the raw list is massive, even this could need batching, 
        # but requirements lists are usually much smaller than full docs.
        result = chain.invoke({"raw_list": raw_data})
        return [r.model_dump() for r in result.requirements]

    def run(self, chunks: List[Dict[str, Any]]) -> List[dict]:
        """Orchestrates the iterative extraction."""
        all_raw_requirements = []
        
        for i, chunk_data in enumerate(chunks):
            chunk_text = chunk_data.get("text", "")
            chunk_id = chunk_data.get("id")
            
            try:
                found = self._extract_from_chunk(chunk_text)
                if found:
                    # Inject source ID
                    for req in found:
                        req.rag_chunk_id = str(chunk_id) if chunk_id else None
                    all_raw_requirements.extend(found)
            except Exception as e:
                logger.error(f"Error in chunk {i}: {e}")
                
        final_list = self._consolidate_requirements(all_raw_requirements)
        return final_list

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL: missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not OPENAI_API_KEY: missing.append("OPENAI_API_KEY")
    if not QDRANT_URL: missing.append("QDRANT_URL")
    if not QDRANT_API_KEY: missing.append("QDRANT_API_KEY")
    if not ANALYSIS_ID: missing.append("ANALYSIS_ID")

    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def fetch_analysis_slug(supabase: Client, analysis_id: str) -> str:
    """Fetches the analysis slug from Supabase."""
    try:
        response = supabase.table("analyses").select("slug").eq("id", analysis_id).single().execute()
        return response.data["slug"]
        return response.data["slug"].strip()
    except Exception as e:
        logger.error(f"Error fetching analysis slug for {analysis_id}: {e}")
        raise

from qdrant_client.http import models

def fetch_chunks_from_qdrant(client: QdrantClient, collection_name: str, analysis_id: str) -> List[Dict[str, Any]]:
    """Fetches all text chunks from Qdrant for a specific analysis, filtered by category='tender'."""
    logger.info(f"Fetching chunks from Qdrant collection '{collection_name}' for analysis '{analysis_id}' (TENDERS only)...")
    
    chunks = []
    offset = None
    
    # Filter: analysis_id AND category='tender'
    search_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="category", match=models.MatchValue(value="tender"))
        ]
    )
    
    # We use scroll to get all points
    while True:
        points, next_offset = client.scroll(
            collection_name=collection_name,
            scroll_filter=search_filter,
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )
        
        for point in points:
            if point.payload and "text" in point.payload:
                chunks.append({
                    "text": point.payload["text"],
                    "id": point.id
                })
        
        offset = next_offset
        if offset is None:
            break
            
    logger.info(f"Fetched {len(chunks)} chunks.")
    return chunks

from qdrant_client.http import models

def save_requirements(supabase: Client, analysis_id: str, requirements: List[dict]):
    """Saves extracted requirements to the analysis_requirements table."""
    if not requirements:
        logger.warning("No requirements to save.")
        return

    logger.info(f"Saving {len(requirements)} requirements to Supabase...")
    
    rows = []
    for req in requirements:
        # req keys: id, category, text, mandatory
        # DB columns: analysis_id, category, requirement_text, is_mandatory, requirement_code
        
        # Validate and normalize category
        cat = req.get("category", "Other")
        if cat not in ["Technical", "Legal", "Other"]:
            cat = "Other"
            
        rows.append({
            "analysis_id": analysis_id,
            "category": cat,
            "requirement_text": req.get("text"),
            "is_mandatory": req.get("mandatory"),
            "is_mandatory": req.get("mandatory"),
            "requirement_code": req.get("id") or f"REQ-{uuid.uuid4().hex[:6].upper()}", # Fallback if LLM doesn't generate ID
            "rag_chunk_id": req.get("rag_chunk_id")
        })
        
    try:
        data = supabase.table("analysis_requirements").insert(rows).execute()
        logger.info("Requirements saved successfully.")
    except Exception as e:
        logger.error(f"Error saving requirements: {e}")
        raise

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    validate_env()
    logger.info(f"Starting Requirement Extractor for ANALYSIS_ID={ANALYSIS_ID}")
    
    supabase = get_supabase_client()
    qdrant = get_qdrant_client()
    
    try:
        log_event(supabase, ANALYSIS_ID, "info", "Iniciando extracción de requerimientos...", EVENT_SOURCE)
        
        # 1. Get collection name (slug)
        slug = fetch_analysis_slug(supabase, ANALYSIS_ID)
        logger.info(f"Target Qdrant collection: {slug}")
        
        # 2. Fetch chunks (filtered by 'tender')
        chunks = fetch_chunks_from_qdrant(qdrant, slug, ANALYSIS_ID)
        
        if not chunks:
            msg = "No chunks found for this analysis with category='tender'."
            logger.warning(msg)
            log_event(supabase, ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
            return

        # 3. Extract requirements
        extractor = IterativeExtractor()
        requirements = extractor.run(chunks)
        
        # 4. Save to DB
        save_requirements(supabase, ANALYSIS_ID, requirements)
        
        summary = f"Extracción completada. {len(requirements)} requerimientos guardados."
        logger.info(summary)
        log_event(supabase, ANALYSIS_ID, "info", summary, EVENT_SOURCE)

    except Exception as e:
        error_msg = f"Fatal error in Requirement Extractor: {str(e)}"
        logger.error(error_msg)
        mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

if __name__ == "__main__":
    main()