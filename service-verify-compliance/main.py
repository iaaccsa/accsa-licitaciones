"""
Verify Compliance Service
=========================
Verifies compliance of ALL proposals in an analysis against extracted requirements.
Uses vector search in Qdrant + reranking with Cohere + verification with Gemini Pro.
OpenAI is used only for embeddings (text-embedding-3-small).

Required environment variables:
  - OPENAI_API_KEY
  - GOOGLE_API_KEY
  - COHERE_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_PROPOSALS_PATH
  - API_REQUIREMENTS_PATH
  - API_COMPLIANCE_RESULTS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import os
import sys
from typing import List, Optional, Literal, Dict, Any

import requests
from openai import OpenAI
from google import genai
from google.genai import types as genai_types
from qdrant_client import QdrantClient
from qdrant_client.http import models
import cohere
from pydantic import BaseModel, Field

from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
COHERE_API_KEY = os.environ.get("COHERE_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_REQUIREMENTS_PATH = os.environ.get("API_REQUIREMENTS_PATH")
API_COMPLIANCE_RESULTS_PATH = os.environ.get("API_COMPLIANCE_RESULTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-verify-compliance"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


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
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None) -> dict | list | None:
    """Make an authenticated request to the backend API."""
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
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
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("COHERE_API_KEY", COHERE_API_KEY),
            ("QDRANT_URL", QDRANT_URL),
            ("QDRANT_API_KEY", QDRANT_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
            ("API_REQUIREMENTS_PATH", API_REQUIREMENTS_PATH),
            ("API_COMPLIANCE_RESULTS_PATH", API_COMPLIANCE_RESULTS_PATH),
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
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "ready", "is_success": False})
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


def get_embedding(client: OpenAI, text: str) -> List[float]:
    """Generates embedding for the query."""
    text = text.replace("\n", " ")
    return client.embeddings.create(input=[text], model=EMBEDDING_MODEL).data[0].embedding


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
    query_vector = get_embedding(openai_client, requirement_text)
    query_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="proposal_id", match=models.MatchValue(value=proposal_id)),
        ]
    )
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


def verify_compliance_llm(gemini_client: genai.Client, requirement: dict, evidence_chunks: List[str]) -> ComplianceResult:
    """Asks Gemini Pro to judge compliance based ONLY on the provided evidence."""
    evidence_text = "\n---\n".join(evidence_chunks)
    prompt = (
        "You are a strict Compliance Auditor.\n"
        "Verify if the PROPOSAL meets the REQUIREMENT based ONLY on the provided EVIDENCE CONTEXT.\n\n"
        "Rules:\n"
        "1. If the evidence explicitly confirms the requirement, status is compliant.\n"
        "2. If the evidence contradicts the requirement, status is non_compliant.\n"
        "3. If the evidence mentions the topic but lacks specific details, status is non_compliant.\n"
        "4. If completely absent, status is missing_info.\n"
        "5. Quote the evidence text exactly in 'evidence_quote'.\n"
        "6. PROVIDE 'reasoning' and 'suggestion' IN SPANISH.\n\n"
        f"REQUIREMENT (ID: {requirement.get('requirement_code') or requirement.get('id')}):\n"
        f"\"{requirement.get('requirement_text') or requirement.get('text')}\"\n\n"
        f"EVIDENCE CONTEXT FOUND IN PROPOSAL:\n{evidence_text}"
    )
    response = gemini_client.models.generate_content(
        model="gemini-3-pro-preview",
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ComplianceResult,
        ),
    )
    return ComplianceResult.model_validate_json(response.text)


def save_results(proposal_id: str, results: List[ComplianceResult]):
    """Saves compliance results via API."""
    rows = [
        {
            "proposal_id": proposal_id,
            "requirement_id": res.requirement_id,
            "status": res.status,
            "evidence_quote": res.evidence_quote,
            "reasoning": res.reasoning,
            "suggestion": res.suggestion
        }
        for res in results
    ]
    api_request("PUT", API_COMPLIANCE_RESULTS_PATH, rows)
    logger.info("Compliance results saved successfully.")


def process_compliance():
    logger.info(f"Starting verify-compliance for ANALYSIS_ID={ANALYSIS_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    co = cohere.Client(COHERE_API_KEY)

    log_event(ANALYSIS_ID, "info", "Iniciando verificación de cumplimiento...", EVENT_SOURCE)

    # 1. Get collection name (slug) via API
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]
    logger.info(f"Target Qdrant collection: {slug}")

    # 2. Fetch proposals via API
    proposals = api_request("POST", f"{API_PROPOSALS_PATH}search", {"analysis_id": ANALYSIS_ID})
    if not proposals:
        logger.warning("No proposals found for this analysis.")
        log_event(ANALYSIS_ID, "warning", "No proposals found for this analysis.", EVENT_SOURCE)
        try:
            api_request("POST", API_JOBS_CALLBACK, {
                "service_name": SERVICE_NAME,
                "analysis_id": ANALYSIS_ID,
                "status": "success"
            })
        except Exception as e:
            logger.error(f"Failed to notify job callback: {e}")
        return

    logger.info(f"Loaded {len(proposals)} proposals")

    # 3. Fetch requirements via API
    requirements = api_request("POST", f"{API_REQUIREMENTS_PATH}search", {"analysis_id": ANALYSIS_ID})
    if not requirements:
        logger.warning("No requirements found for this analysis.")
        log_event(ANALYSIS_ID, "warning", "No requirements found.", EVENT_SOURCE)
        return

    logger.info(f"Loaded {len(requirements)} requirements")

    # 4. Verify each proposal against all requirements
    total_stats = {"compliant": 0, "non_compliant": 0, "missing_info": 0}

    for p_idx, proposal in enumerate(proposals):
        proposal_id = proposal["id"]
        provider_name = proposal.get("provider_name") or proposal_id

        logger.info(f"[{p_idx+1}/{len(proposals)}] Verificando propuesta: {provider_name}")
        log_event(ANALYSIS_ID, "info", f"Verificando propuesta {p_idx+1}/{len(proposals)}: {provider_name}", EVENT_SOURCE)

        results = []
        stats = {"compliant": 0, "non_compliant": 0, "missing_info": 0}

        for i, req in enumerate(requirements):
            req_text = req.get("requirement_text")
            req_id = req.get("id")
            req_code = req.get("requirement_code")

            logger.info(f"  [{i+1}/{len(requirements)}] Checking {req_code}: {req_text[:60]}...")

            evidence = retrieve_evidence(qdrant, openai_client, co, slug, req_text, ANALYSIS_ID, proposal_id)

            if not evidence:
                res = ComplianceResult(
                    requirement_id=req_id,
                    status="missing_info",
                    evidence_quote="N/A",
                    reasoning="La búsqueda semántica no devolvió secciones relevantes en la propuesta.",
                    suggestion="Verificar si la propuesta incluye una sección para este tema."
                )
            else:
                req_for_llm = {"id": req_code, "text": req_text, "requirement_code": req_code}
                res = verify_compliance_llm(gemini_client, req_for_llm, evidence)
                res.requirement_id = req_id

            logger.info(f"    -> Result: {res.status}")
            if res.status in stats:
                stats[res.status] += 1
            results.append(res)

        save_results(proposal_id, results)
        log_event(ANALYSIS_ID, "info", f"Propuesta {provider_name} verificada: {stats}", EVENT_SOURCE)

        for key in total_stats:
            total_stats[key] += stats[key]

    # 5. Summary and success callback
    summary = f"Verificación completada. {len(proposals)} propuestas. {total_stats}"
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE)
    logger.info("Verify Compliance Service complete ✓")

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
        process_compliance()
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
