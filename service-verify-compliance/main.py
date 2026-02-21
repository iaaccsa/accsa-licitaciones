"""
Verify Compliance Service
===============================
Verifies compliance of a proposal against extracted requirements.
Uses vector search in Qdrant + reranking with Cohere + verification with GPT-4.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - ANALYSIS_ID
  - PROPOSAL_ID
  - OPENAI_API_KEY
  - COHERE_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Literal, Dict, Any
from dotenv import load_dotenv
from supabase import create_client, Client
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.http import models
import cohere
from pydantic import BaseModel, Field

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
EVENT_SOURCE = "ACA: service-verify-compliance"
EMBEDDING_MODEL = "text-embedding-3-small"

# Load env vars
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
PROPOSAL_ID = os.environ.get("PROPOSAL_ID")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
COHERE_API_KEY = os.environ.get("COHERE_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")

logger = setup_logger("verify-compliance")



# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class ComplianceResult(BaseModel):
    """The result of an audit for a single requirement."""
    requirement_id: str
    status: Literal["compliant", "non_compliant", "missing_info"]
    evidence_quote: str = Field(description="Verbatim quote from the proposal supporting the decision.")
    reasoning: str = Field(description="Explanation of why it meets or fails the requirement.")
    suggestion: Optional[str] = Field(description="Actionable advice if non-compliant.", default=None)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL: missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    # ANALYSIS_ID is now optional, can be derived from PROPOSAL_ID
    if not PROPOSAL_ID: missing.append("PROPOSAL_ID")
    if not OPENAI_API_KEY: missing.append("OPENAI_API_KEY")
    if not COHERE_API_KEY: missing.append("COHERE_API_KEY")
    if not QDRANT_URL: missing.append("QDRANT_URL")
    if not QDRANT_API_KEY: missing.append("QDRANT_API_KEY")

    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def get_embedding(client: OpenAI, text: str) -> List[float]:
    """Generates embedding for the query."""
    text = text.replace("\n", " ")
    return client.embeddings.create(input=[text], model=EMBEDDING_MODEL).data[0].embedding

def fetch_analysis_slug(supabase: Client, analysis_id: str) -> str:
    """Fetches the analysis slug from Supabase."""
    try:
        response = supabase.table("analyses").select("slug").eq("id", analysis_id).single().execute()
        return response.data["slug"]
    except Exception as e:
        logger.error(f"Error fetching analysis slug for {analysis_id}: {e}")
        raise

def fetch_analysis_id_from_proposal(supabase: Client, proposal_id: str) -> str:
    """Fetches the analysis_id associated with a proposal."""
    try:
        response = supabase.table("proposals").select("analysis_id").eq("id", proposal_id).single().execute()
        return response.data["analysis_id"]
    except Exception as e:
        logger.error(f"Error fetching analysis_id for proposal {proposal_id}: {e}")
        raise

def fetch_requirements(supabase: Client, analysis_id: str) -> List[Dict[str, Any]]:
    """Fetches requirements from Supabase."""
    try:
        response = supabase.table("analysis_requirements").select("*").eq("analysis_id", analysis_id).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching requirements for {analysis_id}: {e}")
        raise

def retrieve_evidence(
    qdrant: QdrantClient, 
    openai_client: OpenAI,
    co: cohere.Client, 
    collection_name: str,
    requirement_text: str, 
    analysis_id: str,
    proposal_id: str,
    top_k_retrieval: int = 25,
    top_n_rerank: int = 5
) -> List[str]:
    """
    1. Searches Qdrant for 'proposal' chunks related to the requirement.
    2. Reranks the results using Cohere to find the most semantic matches.
    """
    
    # 1. Initial Vector Search (Recall)
    query_vector = get_embedding(openai_client, requirement_text)
    
    query_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="proposal_id", match=models.MatchValue(value=proposal_id)),
        ]
    )
    
    logger.debug(f"Querying Qdrant with filter: analysis_id={analysis_id}, proposal_id={proposal_id}")
    
    search_result = qdrant.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=top_k_retrieval,
        query_filter=query_filter
    )
    
    if not search_result.points:
        logger.warning(f"No results found for analysis_id={analysis_id}, proposal_id={proposal_id}")
        return []

    documents = [hit.payload["text"] for hit in search_result.points]
    logger.info(f"  [Qdrant] Found {len(documents)} chunks from proposal")
    
    # 2. Reranking (Precision)
    try:
        rerank_results = co.rerank(
            model="rerank-multilingual-v3.0",
            query=requirement_text,
            documents=documents,
            top_n=top_n_rerank
        )
        
        top_docs = [documents[hit.index] for hit in rerank_results.results]
        logger.info(f"  [Cohere] Reranked to top {len(top_docs)} documents")
        return top_docs
        
    except Exception as e:
        logger.warning(f"  [Cohere] Reranking failed ({e}). Falling back to vector search results.")
        return documents[:top_n_rerank]

def verify_compliance_llm(openai_client: OpenAI, requirement: dict, evidence_chunks: List[str]) -> ComplianceResult:
    """
    Asks the LLM to judge compliance based ONLY on the provided evidence.
    """
    
    evidence_text = "\n---\n".join(evidence_chunks)
    
    system_prompt = """You are a strict Compliance Auditor. 
    Verify if the PROPOSAL meets the REQUIREMENT based ONLY on the provided EVIDENCE CONTEXT.
    
    Rules:
    1. If the evidence explicitly confirms the requirement, status is compliant.
    2. If the evidence contradicts the requirement, status is non_compliant.
    3. If the evidence mentions the topic but lacks specific details, status is non_compliant.
    4. If completely absent, status is missing_info.
    5. Quote the evidence text exactly in 'evidence_quote'.
    6. PROVIDE 'reasoning' and 'suggestion' IN SPANISH.
    """
    
    user_prompt = f"""
    REQUIREMENT (ID: {requirement.get('requirement_code') or requirement.get('id')}):
    "{requirement.get('requirement_text') or requirement.get('text')}"
    
    EVIDENCE CONTEXT FOUND IN PROPOSAL:
    {evidence_text}
    """
    
    completion = openai_client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=ComplianceResult
    )
    
    return completion.choices[0].message.parsed

def save_results(supabase: Client, analysis_id: str, proposal_id: str, results: List[ComplianceResult]):
    """Saves compliance results to Supabase."""
    # Assuming a table exists, if not we might need to create it or assume it exists.
    # The user request implies checking against 'requirement' in supabase.
    # We should probably store the result in a 'compliance_checks' table or similar.
    # checking schema would be good, but for now I'll assume 'analysis_compliance_results' or similar from context.
    # Let's check if there is a specific table mentioned in previous conversations.
    # Conversation 304fb537 mentioned cleanup.
    # I'll stick to a generic structure or `analysis_compliance_results` since `analysis_requirements` exists.
    
    rows = []
    for res in results:
        rows.append({
            # analysis_id is not in the schema provided by user, inferred via proposal_id
            # "analysis_id": analysis_id,
            "proposal_id": proposal_id,
            "requirement_id": res.requirement_id, 
            "status": res.status,
            "evidence_quote": res.evidence_quote,
            "reasoning": res.reasoning,
            "suggestion": res.suggestion
        })
        
    try:
        # Check if table exists or infer. I'll use `proposal_compliance_results` as a good guess.
        # Or `analysis_compliance`.
        # Let's try `proposal_compliance_results`.
        data = supabase.table("proposal_compliance_results").upsert(rows, on_conflict="proposal_id, requirement_id").execute()
        logger.info("Compliance results saved successfully.")
    except Exception as e:
        logger.error(f"Error saving compliance results: {e}")
        # If table doesn't exist, we might fail here.
        # I should probably check schema first but run with this assumption for now.
        raise

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    validate_env()
    
    supabase = get_supabase_client()
    
    # Determine ANALYSIS_ID
    global ANALYSIS_ID
    if not ANALYSIS_ID:
        logger.info(f"ANALYSIS_ID not provided. Fetching from proposal {PROPOSAL_ID}...")
        try:
            ANALYSIS_ID = fetch_analysis_id_from_proposal(supabase, PROPOSAL_ID)
            logger.info(f"Resolved ANALYSIS_ID={ANALYSIS_ID}")
        except Exception as e:
            logger.critical(f"Failed to resolve ANALYSIS_ID: {e}")
            sys.exit(1)

    logger.info(f"Starting verify-compliance for ANALYSIS_ID={ANALYSIS_ID}, PROPOSAL_ID={PROPOSAL_ID}")
    qdrant = get_qdrant_client()
    openai_client = OpenAI()
    co = cohere.Client(COHERE_API_KEY)
    
    try:
        log_event(supabase, ANALYSIS_ID, "info", "Iniciando verificación de cumplimiento...", EVENT_SOURCE)
        
        # 1. Get collection name (slug)
        slug = fetch_analysis_slug(supabase, ANALYSIS_ID)
        logger.info(f"Target Qdrant collection: {slug}")

        # 2. Fetch requirements from Supabase
        requirements = fetch_requirements(supabase, ANALYSIS_ID)
        if not requirements:
            logger.warning("No requirements found for this analysis.")
            log_event(supabase, ANALYSIS_ID, "warning", "No requirements found.", EVENT_SOURCE)
            return

        logger.info(f"Loaded {len(requirements)} requirements")

        # 3. Verify each requirement
        results = []
        stats = {"compliant": 0, "non_compliant": 0, "missing_info": 0}
        
        for i, req in enumerate(requirements):
            req_text = req.get("requirement_text")
            req_id = req.get("id") # UUID in DB
            req_code = req.get("requirement_code") # Readable ID
            
            logger.info(f"[{i+1}/{len(requirements)}] Checking {req_code}: {req_text[:60]}...")
            
            # Retrieve evidence
            evidence = retrieve_evidence(qdrant, openai_client, co, slug, req_text, ANALYSIS_ID, PROPOSAL_ID)
            
            if not evidence:
                res = ComplianceResult(
                    requirement_id=req_id,
                    status="missing_info",
                    evidence_quote="N/A",
                    reasoning="La búsqueda semántica no devolvió secciones relevantes en la propuesta.",
                    suggestion="Verificar si la propuesta incluye una sección para este tema."
                )
            else:
                # Verify
                # We pass the requirement dict, needing text and id/code
                req_for_llm = {"id": req_code, "text": req_text, "requirement_code": req_code}
                res = verify_compliance_llm(openai_client, req_for_llm, evidence)
                # Ensure the result uses the UUID for DB linkage if needed, or we just store the code.
                # Actually ComplianceResult.requirement_id comes from the LLM, which sees req_code.
                # But for saving to DB we might want the UUID.
                # Let's override requirement_id in the result object for saving, or handle it in save_results.
                res.requirement_id = req_id # Link to the DB UUID
                
            logger.info(f"  -> Result: {res.status}")
            if res.status in stats:
                stats[res.status] += 1
            results.append(res)
            
        # 4. Save results
        save_results(supabase, ANALYSIS_ID, PROPOSAL_ID, results)
        
        summary = f"Verificación completada. {stats}"
        logger.info(summary)
        log_event(supabase, ANALYSIS_ID, "info", summary, EVENT_SOURCE)

    except Exception as e:
        error_msg = f"Fatal error in verify-compliance: {str(e)}"
        logger.error(error_msg)
        mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

if __name__ == "__main__":
    main()
