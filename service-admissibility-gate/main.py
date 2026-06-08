"""
Admissibility Gate Service (partial)
====================================
Given an ANALYSIS_ID and a PROPOSAL_ID, evaluates whether the proposal
passes the formal admissibility check by cross-referencing:

  - All rows in admissibility_requirements for this analysis (dedicated table,
    every row is already an admissibility requirement).
  - Their verdict in admissibility_results.

This is a PARTIAL gate that runs right after the compliance-matcher
(before summarizer and economic-offer-extractor). Its purpose is to
let the user decide early which proposals continue in the pipeline.

The service is 100% DETERMINISTIC — no LLM, no Qdrant, no embeddings.

Verdicts:
  - admitida:  all admissibility requirements have verdict `cumple`.
  - rechazada: at least one requirement has a verdict other than `cumple`.

The user can override the verdict via HITL (PATCH .../admissibility-override)
before the pipeline continues.

Required environment variables:
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_PROPOSALS_PATH
  - API_ADMISSIBILITY_REQUIREMENTS_PATH
  - API_ADMISSIBILITY_RESULTS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID        (runtime)
  - PROPOSAL_ID        (runtime)
"""

import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests

from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_ADMISSIBILITY_REQUIREMENTS_PATH = os.environ.get("API_ADMISSIBILITY_REQUIREMENTS_PATH")
API_ADMISSIBILITY_RESULTS_PATH = os.environ.get("API_ADMISSIBILITY_RESULTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
PROPOSAL_ID = os.environ.get("PROPOSAL_ID")

SERVICE_NAME = "service-admissibility-gate"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None, params: dict | None = None) -> dict | list | None:
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, params=params, headers=API_HEADERS, timeout=60)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
    missing = [
        var for var, val in [
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
            ("API_ADMISSIBILITY_REQUIREMENTS_PATH", API_ADMISSIBILITY_REQUIREMENTS_PATH),
            ("API_ADMISSIBILITY_RESULTS_PATH", API_ADMISSIBILITY_RESULTS_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
            ("PROPOSAL_ID", PROPOSAL_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------
def mark_admissibility_result(proposal_id: str, status: str, reasons: List[dict]):
    now = datetime.now(timezone.utc).isoformat()
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/admissibility-result", {
        "admissibility_completed_at": now,
        "admissibility_status": status,
        "admissibility_reasons": reasons,
    })
    logger.info(f"Proposal {proposal_id} admissibility: {status} ({len(reasons)} reasons).")


def mark_admissibility_failure(proposal_id: str, error: str):
    try:
        now = datetime.now(timezone.utc).isoformat()
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/admissibility-failure", {
            "admissibility_completed_at": now,
            "admissibility_error": error,
        })
    except Exception as e:
        logger.error(f"Failed to mark admissibility-failure: {e}")


def notify_success():
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "proposal_id": PROPOSAL_ID,
            "status": "success",
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def notify_failure(error_msg: str):
    logger.error(f"notify_failure: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "proposal_id": PROPOSAL_ID,
            "status": "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


# ---------------------------------------------------------------------------
# Data loading (with pagination)
# ---------------------------------------------------------------------------
def load_all_paginated(path: str, params: dict | None = None, limit: int = 100) -> List[dict]:
    all_results: List[dict] = []
    offset = 0
    base_params = dict(params or {})
    while True:
        base_params["limit"] = limit
        base_params["offset"] = offset
        result = api_request("GET", path, params=base_params)
        if not isinstance(result, list):
            raise RuntimeError(f"Unexpected response from {path}: {type(result)}")
        all_results.extend(result)
        if len(result) < limit:
            break
        offset += limit
        if offset > 100_000:
            raise RuntimeError(f"Safety guard: offset exceeded 100k loading {path}")
    return all_results


def load_proposal(proposal_id: str) -> dict:
    result = api_request("GET", f"{API_PROPOSALS_PATH}{proposal_id}")
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected response from proposals: {type(result)}")
    return result


def load_admissibility_requirements(analysis_id: str) -> List[dict]:
    # Only verified requirements count; the matcher produces results for these only,
    # so requirements and admissibility_results line up 1:1.
    return load_all_paginated(
        f"{API_ADMISSIBILITY_REQUIREMENTS_PATH}{analysis_id}",
        params={"is_verified": "true"},
    )


def load_admissibility_results(proposal_id: str) -> List[dict]:
    return load_all_paginated(
        f"{API_ADMISSIBILITY_RESULTS_PATH}by-proposal/{proposal_id}",
    )


# ---------------------------------------------------------------------------
# Admissibility logic
# ---------------------------------------------------------------------------
def evaluate_admissibility(
    requirements: List[dict],
    matrix_entries: List[dict],
) -> tuple:
    """Returns (status, reasons) where status is 'admitida' or 'rechazada'.

    Only requirements with role 'admisibilidad_obligatoria' block admission. A
    'subsanable' requirement that fails is recorded (non-blocking) for HITL
    visibility but does not reject the proposal. Blocking-ness is conveyed via the
    reason `type` (the AdmissibilityReason schema drops unknown fields).
    """

    # Build lookup: requirement_id -> result entry
    matrix_by_req: Dict[str, dict] = {}
    for entry in matrix_entries:
        req_id = str(entry.get("requirement_id", ""))
        matrix_by_req[req_id] = entry

    reasons: List[dict] = []
    blocking = 0

    for req in requirements:
        req_id = str(req["id"])
        req_code = req.get("requirement_code", "?")
        is_obligatoria = "admisibilidad_obligatoria" in (req.get("roles") or [])
        entry = matrix_by_req.get(req_id)

        if not entry:
            # No result row for this requirement. Shouldn't happen (the matcher emits
            # one per verified requirement), but guard against it.
            reasons.append({
                "type": "auto_admisibilidad_missing" if is_obligatoria else "auto_admisibilidad_subsanable_missing",
                "requirement_id": req_id,
                "requirement_code": req_code,
                "verdict": None,
                "reasoning": "No se encontro entrada en admissibility_results para este requisito de admisibilidad.",
            })
            if is_obligatoria:
                blocking += 1
            continue

        verdict = entry.get("verdict")
        if verdict != "cumple":
            reasons.append({
                "type": "auto_admisibilidad_no_cumple" if is_obligatoria else "auto_admisibilidad_subsanable_no_cumple",
                "requirement_id": req_id,
                "requirement_code": req_code,
                "verdict": verdict,
                "reasoning": entry.get("reasoning"),
            })
            if is_obligatoria:
                blocking += 1

    # Decision: only obligatoria failures reject; subsanable failures do not block.
    if blocking:
        return "rechazada", reasons
    return "admitida", reasons


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def process_admissibility_gate():
    logger.info(f"Starting admissibility-gate for ANALYSIS_ID={ANALYSIS_ID} PROPOSAL_ID={PROPOSAL_ID}")

    # The proposal is already in "evaluating" (set by service-admissibility-matcher,
    # which runs immediately before this gate). We go straight to the decision.
    try:
        proposal = load_proposal(PROPOSAL_ID)
        label = proposal.get("label", PROPOSAL_ID)

        log_event(ANALYSIS_ID, "info", f"Evaluando admisibilidad de propuesta {label}...", EVENT_SOURCE)

        # Load all admissibility requirements (dedicated table)
        requirements = load_admissibility_requirements(ANALYSIS_ID)
        logger.info(f"Loaded {len(requirements)} admissibility requirements.")

        if not requirements:
            # No admissibility requirements -> auto-admit
            logger.info("No admissibility requirements found. Proposal auto-admitted.")
            log_event(ANALYSIS_ID, "info",
                      f"Propuesta {label}: no hay requisitos de admisibilidad. Admitida automaticamente.",
                      EVENT_SOURCE)
            mark_admissibility_result(PROPOSAL_ID, "admitida", [])
            notify_success()
            return

        # Load admissibility results for this proposal
        matrix_entries = load_admissibility_results(PROPOSAL_ID)
        logger.info(f"Loaded {len(matrix_entries)} admissibility result entries.")

        # Evaluate
        status, reasons = evaluate_admissibility(requirements, matrix_entries)

        mark_admissibility_result(PROPOSAL_ID, status, reasons)

        summary_msg = (
            f"Admisibilidad de {label}: {status.upper()} | "
            f"reqs evaluados: {len(requirements)} | "
            f"motivos de rechazo: {len(reasons)}"
        )
        logger.info(summary_msg)
        log_event(ANALYSIS_ID, "info", summary_msg, EVENT_SOURCE, {
            "proposal_id": PROPOSAL_ID,
            "admissibility_status": status,
            "admissibility_reqs": len(requirements),
            "matrix_entries_loaded": len(matrix_entries),
            "rejection_reasons": len(reasons),
        })

        notify_success()

    except Exception as e:
        mark_admissibility_failure(PROPOSAL_ID, str(e))
        raise


def main():
    validate_env()
    try:
        process_admissibility_gate()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during admissibility evaluation: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during admissibility evaluation: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
