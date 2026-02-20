import logging
from typing import List, Optional
from uuid import UUID

from app.core.azure import azure_container_apps_client
from app.core.config import get_settings
from app.config.jobs_config import get_root_jobs, get_next_jobs, is_valid_job
from app.schemas.event import EventBase
from app.services.event_service import event_service
from app.repositories.analysis_repository import analysis_repository

logger = logging.getLogger(__name__)
settings = get_settings()


class JobOrchestratorService:
    def __init__(self):
        self.client = azure_container_apps_client
        self.resource_group = settings.AZURE_RESOURCE_GROUP
        self.registry = settings.AZURE_CONTAINER_REGISTRY

    def start_pipeline(self, analysis_id: UUID, proposal_id: Optional[UUID] = None) -> str:
        """Start the pipeline by launching the root job(s)."""
        root_jobs = get_root_jobs()
        if not root_jobs:
            raise ValueError("No root jobs found in the jobs tree configuration.")

        first_job = root_jobs[0]

        try:
            # 1. Launch the ACA job and wait for ack
            azure_response = self._launch_job(first_job, analysis_id, proposal_id)

            # 2. Log success event
            self._log_event(analysis_id, "info", f"Started job {first_job}", azure_response)

            # 3. Update analysis status to processing
            analysis_repository.update_by_id(str(analysis_id), {"status": "processing"})

        except Exception as e:
            logger.error(f"Failed to start pipeline for analysis_id={analysis_id}: {e}")

            # Log error event
            self._log_event(analysis_id, "error", f"Failed to start job {first_job}", {"error": str(e)})

            # Update analysis to ready with is_success=false
            analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})

            raise

        logger.info(
            f"Pipeline started for analysis_id={analysis_id}, "
            f"launched root job: {first_job}"
        )
        return first_job

    def on_job_completed(
        self,
        job_name: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
        status: str = "success",
        error_message: Optional[str] = None,
    ) -> List[str]:
        """Handle job completion callback and launch next jobs if successful."""
        if not is_valid_job(job_name):
            logger.warning(f"Received callback for unknown job: {job_name}")
            return []

        if status == "failed":
            logger.error(
                f"Job {job_name} failed for analysis_id={analysis_id}. "
                f"Error: {error_message}. Pipeline halted."
            )
            return []

        # Job succeeded — find and launch next jobs
        next_jobs = get_next_jobs(job_name)
        launched = []

        for next_job in next_jobs:
            try:
                azure_response = self._launch_job(next_job, analysis_id, proposal_id)
                self._log_event(analysis_id, "info", f"Started job {next_job}", azure_response)
                launched.append(next_job)
                logger.info(
                    f"Launched next job: {next_job} after {job_name} "
                    f"for analysis_id={analysis_id}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to launch job {next_job} after {job_name}: {e}"
                )
                self._log_event(analysis_id, "error", f"Failed to start job {next_job}", {"error": str(e)})
                analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})

        if not next_jobs:
            logger.info(
                f"Pipeline completed for analysis_id={analysis_id}. "
                f"Last job was: {job_name}"
            )

        return launched

    def _launch_job(
        self,
        service_name: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
    ) -> dict:
        """Launch a single Azure Container Apps Job. Returns Azure response dict."""
        image = f"{self.registry}/{service_name}:latest"

        env_vars = [
            {"name": "ANALYSIS_ID", "value": str(analysis_id)},
            {"name": "PROPOSAL_ID", "value": str(proposal_id) if proposal_id else ""},
        ]

        template = {
            "containers": [
                {
                    "name": service_name,
                    "image": image,
                    "env": env_vars,
                }
            ]
        }

        logger.info(f"Launching Azure job: {service_name} with image: {image}")

        poller = self.client.jobs.begin_start(
            resource_group_name=self.resource_group,
            job_name=service_name,
            template=template,
        )

        result = poller.result()
        return result.as_dict() if result else {"status": "accepted"}

    def _log_event(
        self,
        analysis_id: UUID,
        level: str,
        message: str,
        details: dict,
    ) -> None:
        """Log an event to the events table."""
        event_data = EventBase(
            analysis_id=analysis_id,
            level=level,
            source="BACKEND",
            message=message,
            details=details,
        )
        event_service.create_event(event_data)


job_orchestrator_service = JobOrchestratorService()

