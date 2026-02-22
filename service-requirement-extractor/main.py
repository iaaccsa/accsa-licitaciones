"""
Iterative Requirement Extractor
================================
Extracts requirements from tender documents indexed in Qdrant.
Fetches chunks for a given `ANALYSIS_ID`, filters by `category='tender'`,
extracts requirements using OpenAI, and stores them via API.

Required environment variables:
  - OPENAI_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_REQUIREMENTS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import os
import sys
import json
import uuid
from typing import List, Optional, Dict, Any

import requests
from qdrant_client import QdrantClient
from qdrant_client.http import models
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
import warnings

from supabase_logger import setup_logger, log_event

# Suppress Pydantic internal serialization warnings (harmless noise from LangChain)
warnings.filterwarnings("ignore", message=".*PydanticSerializationUnexpectedValue.*")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_REQUIREMENTS_PATH = os.environ.get("API_REQUIREMENTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-requirement-extractor"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"

logger = setup_logger(SERVICE_NAME)


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

        structured_llm = self.reduce_llm.with_structured_output(RawRequirementsList)
        chain = prompt | structured_llm
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
                    for req in found:
                        req.rag_chunk_id = str(chunk_id) if chunk_id else None
                    all_raw_requirements.extend(found)
            except Exception as e:
                logger.error(f"Error in chunk {i}: {e}")
        return self._consolidate_requirements(all_raw_requirements)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None) -> dict | list | None:
    """Make an authenticated request to the backend API."""
    url = f"{API_BASE_URL}{path}"
    response = requests.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
    """Ensure all required environment variables are set."""
    missing = [
        var for var, val in [
            ("OPENAI_API_KEY", OPENAI_API_KEY),
            ("QDRANT_URL", QDRANT_URL),
            ("QDRANT_API_KEY", QDRANT_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_REQUIREMENTS_PATH", API_REQUIREMENTS_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure called with: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "failed"})
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "failed",
            "error_message": error_msg
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def fetch_chunks_from_qdrant(client: QdrantClient, collection_name: str, analysis_id: str) -> List[Dict[str, Any]]:
    """Fetches all text chunks from Qdrant for a specific analysis, filtered by category='tender'."""
    logger.info(f"Fetching chunks from Qdrant collection '{collection_name}' (TENDERS only)...")
    chunks = []
    offset = None
    search_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="category", match=models.MatchValue(value="tender"))
        ]
    )
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
                chunks.append({"text": point.payload["text"], "id": point.id})
        offset = next_offset
        if offset is None:
            break
    logger.info(f"Fetched {len(chunks)} chunks.")
    return chunks


def save_requirements(analysis_id: str, requirements: List[dict]):
    """Saves extracted requirements via API."""
    if not requirements:
        logger.warning("No requirements to save.")
        return

    logger.info(f"Saving {len(requirements)} requirements via API...")
    valid_categories = ["Technical", "Administrative", "Legal", "Financial", "Other"]
    rows = []
    for req in requirements:
        cat = req.get("category", "Other")
        if cat not in valid_categories:
            cat = "Other"
        rows.append({
            "analysis_id": analysis_id,
            "category": cat,
            "requirement_text": req.get("text"),
            "requirement_code": req.get("id") or f"REQ-{uuid.uuid4().hex[:6].upper()}",
            "is_mandatory": req.get("mandatory"),
            "rag_chunk_id": req.get("rag_chunk_id")
        })

    api_request("POST", API_REQUIREMENTS_PATH, rows)
    logger.info("Requirements saved successfully.")


def process_extraction():
    logger.info(f"Starting Requirement Extractor for ANALYSIS_ID={ANALYSIS_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    log_event(ANALYSIS_ID, "info", "Iniciando extracción de requerimientos...", EVENT_SOURCE)

    # 1. Get collection name (slug) via API
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]
    logger.info(f"Target Qdrant collection: {slug}")

    # 2. Fetch chunks (filtered by 'tender')
    chunks = fetch_chunks_from_qdrant(qdrant, slug, ANALYSIS_ID)
    if not chunks:
        msg = "No chunks found for this analysis with category='tender'."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
        return

    # 3. Extract requirements
    extractor = IterativeExtractor()
    requirements = extractor.run(chunks)

    # 4. Save via API
    save_requirements(ANALYSIS_ID, requirements)

    summary = f"Extracción completada. {len(requirements)} requerimientos guardados."
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE)
    logger.info("Requirement Extractor complete ✓")

    # 5. Notify success callback
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success"
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def main():
    validate_env()
    try:
        process_extraction()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during processing: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during processing: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
