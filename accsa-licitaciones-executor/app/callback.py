import logging
from typing import Optional
from uuid import UUID

import httpx

from app.models import StartJobRequest

logger = logging.getLogger(__name__)

CALLBACK_TIMEOUT_SECONDS = 30


def _optional(value: Optional[UUID]) -> Optional[str]:
    return str(value) if value else None


async def notify_failure(request: StartJobRequest, error_message: str) -> None:
    """Report a job that died without reporting for itself: OOM kill, hard crash
    or watchdog timeout.

    Reuses the job's own API_BASE_URL / API_KEY / API_JOBS_CALLBACK instead of
    carrying its own copy, so the executor needs no configuration to reach the
    API and cannot drift from what the container was told. The URL is joined the
    same way the services do it: API_BASE_URL + path.

    A failure here is logged and swallowed, exactly like the services do: the
    API's JobMonitor is the remaining backstop.
    """
    base_url = request.env.get("API_BASE_URL")
    path = request.env.get("API_JOBS_CALLBACK")
    if not base_url or not path:
        logger.error(
            f"Cannot notify failure of {request.service_name}: the job environment "
            f"carries no API_BASE_URL / API_JOBS_CALLBACK"
        )
        return

    payload = {
        "service_name": request.service_name,
        "analysis_id": str(request.analysis_id),
        "proposal_id": _optional(request.proposal_id),
        "file_id": _optional(request.file_id),
        "original_file_id": _optional(request.original_file_id),
        "status": "failed",
        "error_message": error_message,
    }

    try:
        async with httpx.AsyncClient(timeout=CALLBACK_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{base_url}{path}",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": request.env.get("API_KEY", ""),
                },
            )
            response.raise_for_status()
        logger.info(f"Synthesized failure callback sent for {request.service_name}")
    except Exception as e:
        # The type matters: httpx timeouts stringify to an empty message, so
        # without it the log line says nothing at all.
        logger.error(
            f"Failed to send synthesized callback for {request.service_name} "
            f"(analysis_id={request.analysis_id}): {type(e).__name__}: {e}"
        )
