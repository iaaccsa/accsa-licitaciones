"""
Proposal Scorer Service
=======================
Calculates compliance scores and generates markdown summaries for all proposals
in an analysis, using compliance counts from proposals_view and detailed results
from proposal_compliance_results_view.

Required environment variables:
  - GOOGLE_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_PROPOSALS_PATH
  - API_COMPLIANCE_RESULTS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import os
import sys
from typing import List, Dict, Any

import requests
from google import genai
from google.genai import types as genai_types

from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_COMPLIANCE_RESULTS_PATH = os.environ.get("API_COMPLIANCE_RESULTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-proposal-scorer"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
GEMINI_MODEL = "gemini-2.5-pro"

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


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
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
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


def calc_score(proposal: Dict[str, Any]) -> float:
    """Calculate compliance score as a percentage (0.00 – 100.00).

    Formula: compliant / (compliant + non_compliant + missing_info + unprocessable) * 100
    unprocessable counts against the score (included in denominator).
    """
    compliant = proposal.get("compliant_count", 0) or 0
    non_compliant = proposal.get("non_compliant_count", 0) or 0
    missing_info = proposal.get("missing_info_count", 0) or 0
    unprocessable = proposal.get("unprocessable_count", 0) or 0
    total = compliant + non_compliant + missing_info + unprocessable
    if total == 0:
        return 0.00
    return round(compliant / total * 100, 2)


def generate_summary(
    gemini_client: genai.Client,
    proposal: Dict[str, Any],
    score: float,
    results: List[Dict[str, Any]]
) -> str:
    """Generate a 2-paragraph markdown compliance summary using Gemini."""
    compliant = proposal.get("compliant_count", 0) or 0
    non_compliant = proposal.get("non_compliant_count", 0) or 0
    missing_info = proposal.get("missing_info_count", 0) or 0
    unprocessable = proposal.get("unprocessable_count", 0) or 0
    provider_name = proposal.get("provider_name") or proposal["id"]

    rows = "\n".join(
        f"{r.get('requirement_code', 'N/A')} | "
        f"{r.get('requirement_category', 'N/A')} | "
        f"{'mandatory' if r.get('requirement_is_mandatory') else 'optional'} | "
        f"{r.get('status', 'N/A')} | "
        f"{(r.get('reasoning') or '')[:200]}"
        for r in results
    )

    prompt = (
        "You are an expert auditor specializing in public procurement compliance.\n"
        "You will be provided with the detailed compliance verification results for a proposal.\n\n"
        "Write exactly 2 paragraphs in Spanish using markdown format:\n"
        "- Paragraph 1: General summary of the compliance level (score, strong areas).\n"
        "- Paragraph 2: Main gaps identified and actionable recommendations.\n\n"
        "Do not use headings or bullet lists. Only 2 continuous text paragraphs.\n\n"
        f"PROPOSAL: {provider_name}\n"
        f"SCORE: {score}% ({compliant} compliant, {non_compliant} non-compliant, "
        f"{missing_info} missing info, {unprocessable} unprocessable)\n\n"
        "DETAILED RESULTS:\n"
        "requirement_code | category | mandatory | status | reasoning\n"
        f"{rows}"
    )

    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="text/plain",
        ),
    )
    return response.text.strip()


def process_scoring():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID}")

    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    log_event(ANALYSIS_ID, "info", "Iniciando cálculo de scores y resúmenes...", EVENT_SOURCE)

    # 1. Fetch proposals with compliance counts (from proposals_view)
    proposals = api_request("POST", f"{API_PROPOSALS_PATH}search-with-counts", {"analysis_id": ANALYSIS_ID})
    if not proposals:
        logger.warning("No proposals found for this analysis.")
        log_event(ANALYSIS_ID, "warning", "No se encontraron propuestas para este análisis.", EVENT_SOURCE)
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

    # 2. Score and summarize each proposal
    for p_idx, proposal in enumerate(proposals):
        proposal_id = proposal["id"]
        provider_name = proposal.get("provider_name") or proposal_id

        logger.info(f"[{p_idx+1}/{len(proposals)}] Scoring proposal: {provider_name}")
        log_event(ANALYSIS_ID, "info", f"Procesando propuesta {p_idx+1}/{len(proposals)}: {provider_name}", EVENT_SOURCE)

        # a. Calculate compliance score
        score = calc_score(proposal)
        logger.info(f"  Score: {score}%")

        # b. Fetch detailed compliance results for summary generation
        results = api_request("POST", f"{API_COMPLIANCE_RESULTS_PATH}search", {"proposal_id": proposal_id})
        if not results:
            logger.warning(f"  No compliance results found for proposal {proposal_id}")
            results = []

        # c. Generate 2-paragraph markdown summary with Gemini
        summary = generate_summary(gemini_client, proposal, score, results)
        logger.info(f"  Summary generated ({len(summary)} chars)")

        # d. Persist score and summary
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/score", {
            "compliance_score": score,
            "compliance_summary": summary
        })

        log_event(ANALYSIS_ID, "info", f"Propuesta {provider_name}: score={score}%", EVENT_SOURCE)

    # 3. Final log and success callback
    summary_msg = f"Scoring completado para {len(proposals)} propuesta(s)."
    logger.info(summary_msg)
    log_event(ANALYSIS_ID, "info", summary_msg, EVENT_SOURCE)
    logger.info(f"{SERVICE_NAME} complete ✓")

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
        process_scoring()
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
