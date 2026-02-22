import logging
from typing import List, Optional
from uuid import UUID

from app.core.azure import azure_container_apps_client
from app.core.config import get_settings
from app.config.jobs_config import get_root_jobs, get_next_jobs, is_valid_job
from app.schemas.event import EventBase
from app.services.event_service import event_service
from app.repositories.analysis_repository import analysis_repository
from app.repositories.job_repository import job_repository
from app.services.workflow_step_service import workflow_step_service

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
            # 1. Complete the initial workflow step (parent)
            try:
                # We need to find which service has 'is_initial': True to complete it
                # For now, we know from the config that 'service-queue' is the initial one,
                # but let's complete it using its service name
                workflow_step_service.complete_step_by_service(str(analysis_id), "service-queue")
            except Exception as e:
                logger.error(f"Failed to complete initial workflow step: {e}")

            # 2. Start the workflow step for the first job
            try:
                workflow_step_service.start_step_by_service(str(analysis_id), first_job)
            except Exception as e:
                logger.error(f"Failed to start workflow step for first job {first_job}: {e}")

            # 3. Launch the ACA job and wait for ack
            azure_response = self._launch_job(first_job, analysis_id, proposal_id)

            # 4. Log success event
            self._log_event(analysis_id, "info", f"Started job {first_job}", azure_response)

            # 5. Update analysis status to processing
            analysis_repository.update_by_id(str(analysis_id), {"status": "processing"})

        except Exception as e:
            logger.error(f"Failed to start pipeline for analysis_id={analysis_id}: {e}")

            # Mark the workflow step of the first job as failed
            try:
                workflow_step_service.fail_step_by_service(str(analysis_id), first_job)
            except Exception as step_error:
                logger.error(f"Failed to fail workflow step for {first_job}: {step_error}")

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
        service_name: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
        status: str = "success",
        error_message: Optional[str] = None,
    ) -> List[str]:
        """Handle job completion callback and launch next jobs if successful."""
        if not is_valid_job(service_name):
            logger.warning(f"Received callback for unknown job: {service_name}")
            return []

        job_status = "succeeded" if status == "success" else "failed"
        job_repository.update_job_status(str(analysis_id), service_name, job_status)

        if status == "success":
            # Complete current workflow step
            try:
                workflow_step_service.complete_step_by_service(str(analysis_id), service_name)
            except Exception as e:
                logger.error(f"Failed to complete workflow step for {service_name}: {e}")

        if status == "failed":
            logger.error(
                f"Job {service_name} failed for analysis_id={analysis_id}. "
                f"Error: {error_message}. Pipeline halted."
            )
            try:
                workflow_step_service.fail_step_by_service(str(analysis_id), service_name)
            except Exception as e:
                logger.error(f"Failed to mark workflow step as failed for {service_name}: {e}")
            analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})
            self._log_event(analysis_id, "error", f"Job {service_name} failed with error: {error_message}", {"error": error_message})
            return []

        # Job succeeded — find and launch next jobs
        next_jobs = get_next_jobs(service_name)
        launched = []

        for next_job in next_jobs:
            try:
                azure_response = self._launch_job(next_job, analysis_id, proposal_id)
                self._log_event(analysis_id, "info", f"Started job {next_job}", azure_response)
                
                # Start workflow step
                try:
                    workflow_step_service.start_step_by_service(str(analysis_id), next_job)
                except Exception as step_error:
                    logger.error(f"Failed to start workflow step for {next_job}: {step_error}")

                launched.append(next_job)
                logger.info(
                    f"Launched next job: {next_job} after {service_name} "
                    f"for analysis_id={analysis_id}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to launch job {next_job} after {service_name}: {e}"
                )

                # Mark the workflow step of the job that failed to launch as failed
                try:
                    workflow_step_service.fail_step_by_service(str(analysis_id), next_job)
                except Exception as step_error:
                    logger.error(f"Failed to fail workflow step for {next_job}: {step_error}")

                self._log_event(analysis_id, "error", f"Failed to start job {next_job}", {"error": str(e)})
                analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})

        if not next_jobs:
            logger.info(
                f"Pipeline completed for analysis_id={analysis_id}. "
                f"Last job was: {service_name}"
            )

        return launched

    def _launch_job(
        self,
        service_name: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
    ) -> dict:
        """Launch a single Azure Container Apps Job and create a record in the jobs table."""
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
        azure_response = result.as_dict() if result else {}

        # Create job record in the jobs table
        job_record = {
            "analysis_id": str(analysis_id),
            "service_name": service_name,
            "azure_execution_id": azure_response.get("id", ""),
            "execution_name": azure_response.get("name", ""),
            "input_payload": {
                "ANALYSIS_ID": str(analysis_id),
                "PROPOSAL_ID": str(proposal_id) if proposal_id else "",
            },
        }
        job_repository.create(job_record)

        return azure_response

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

