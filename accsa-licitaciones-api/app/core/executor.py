import logging
from typing import Optional
from uuid import UUID

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Starting a job only queues it, so the agent answers immediately; the margin is
# for VM2 being busy, not for the container running.
START_TIMEOUT_SECONDS = 30
# The agent waits for the container to settle before answering a DELETE.
STOP_TIMEOUT_SECONDS = 30
HEALTH_TIMEOUT_SECONDS = 5

class ExecutorClient:
    """HTTP client for the on-prem job executor agent on VM2.

    It never sends an image name: the agent derives it from service_name after
    checking its own allowlist, which is what bounds the damage of the agent
    holding the Docker socket."""

    def __init__(self):
        self.base_url = settings.EXECUTOR_BASE_URL.rstrip("/")
        self.headers = {"X-API-Key": settings.EXECUTOR_API_KEY}

    def start_job(
        self,
        service_name: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
        file_id: Optional[UUID] = None,
        original_file_id: Optional[UUID] = None,
        env: Optional[dict] = None,
    ) -> dict:
        """Queue one job. Returns {execution_id, execution_name, state}.

        file_id and original_file_id travel separately even though the container
        only ever sees FILE_ID: the agent needs both to reproduce the callback
        identity if it has to synthesize a failure."""
        payload = {
            "service_name": service_name,
            "analysis_id": str(analysis_id),
            "proposal_id": str(proposal_id) if proposal_id else None,
            "file_id": str(file_id) if file_id else None,
            "original_file_id": str(original_file_id) if original_file_id else None,
            "env": env or {},
        }
        response = httpx.post(
            f"{self.base_url}/jobs",
            json=payload,
            headers=self.headers,
            timeout=START_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    def stop_job(self, execution_id: str) -> dict:
        response = httpx.delete(
            f"{self.base_url}/jobs/{execution_id}",
            headers=self.headers,
            timeout=STOP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    def health(self) -> dict:
        response = httpx.get(
            f"{self.base_url}/health",
            headers=self.headers,
            timeout=HEALTH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

executor_client = ExecutorClient()
