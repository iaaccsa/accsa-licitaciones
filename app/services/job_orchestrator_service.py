import logging
from typing import List, Optional
from uuid import UUID

from app.core.azure import azure_container_apps_client
from app.core.config import get_settings
from app.config.jobs_config import get_root_jobs, get_next_jobs, get_parent_jobs, is_valid_job, is_final_job, is_fan_out_job, get_fan_out_type, is_pause_after_job
from app.repositories.original_file_repository import original_file_repository
from app.repositories.processed_file_repository import processed_file_repository
from app.repositories.proposal_repository import proposal_repository
from app.schemas.event import EventBase
from app.services.event_service import event_service
from app.repositories.analysis_repository import analysis_repository
from app.repositories.job_repository import job_repository
from app.services.workflow_step_service import workflow_step_service
from app.repositories.workflow_step_repository import workflow_step_repository
from app.services.email_service import email_service

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
                workflow_step_service.start_step_by_service(str(analysis_id), first_job, instances_count=1)
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
        file_id: Optional[UUID] = None,
        original_file_id: Optional[UUID] = None,
        status: str = "success",
        error_message: Optional[str] = None,
    ) -> List[str]:
        """Handle job completion callback and launch next jobs if successful."""
        if not is_valid_job(service_name):
            logger.warning(f"Received callback for unknown job: {service_name}")
            return []

        job_status = "succeeded" if status == "success" else "failed"
        file_id_str = str(file_id) if file_id else None
        original_file_id_str = str(original_file_id) if original_file_id else None
        proposal_id_str = str(proposal_id) if proposal_id else None
        job_repository.update_job_status(str(analysis_id), service_name, job_status, file_id=file_id_str, original_file_id=original_file_id_str, proposal_id=proposal_id_str)

        if status == "failed":
            logger.error(
                f"Job {service_name} failed for analysis_id={analysis_id}"
                f" file_id={file_id}. Error: {error_message}. Pipeline halted."
            )
            try:
                workflow_step_service.fail_step_by_service(str(analysis_id), service_name)
            except Exception as e:
                logger.error(f"Failed to mark workflow step as failed for {service_name}: {e}")
            analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})
            self._log_event(analysis_id, "error", f"Job {service_name} failed with error: {error_message}", {"error": error_message, "file_id": str(file_id) if file_id else None})
            self._notify_by_email(analysis_id, "failed")
            return []

        # Job succeeded — check if fan-out job needs to wait for all instances
        if is_fan_out_job(service_name):
            total = job_repository.count_jobs_by_service(str(analysis_id), service_name)
            completed = job_repository.count_completed_jobs(str(analysis_id), service_name)
            logger.info(
                f"Fan-out job {service_name}: {completed}/{total} completed "
                f"for analysis_id={analysis_id}"
            )
            if completed < total:
                # Not all instances done yet — wait
                return []

        # All instances done (or not a fan-out job) — atomically complete workflow step.
        # Returns False if another concurrent callback already completed it.
        try:
            step_claimed = workflow_step_service.complete_step_by_service_if_running(str(analysis_id), service_name)
        except Exception as e:
            logger.error(f"Failed to complete workflow step for {service_name}: {e}")
            step_claimed = False

        if not step_claimed:
            logger.info(
                f"Workflow step for {service_name} already completed by a concurrent callback "
                f"— skipping for analysis_id={analysis_id}"
            )
            return []

        # Check if pipeline should pause for user approval
        if is_pause_after_job(service_name):
            analysis_repository.update_by_id(
                str(analysis_id),
                {"status": "awaiting_approval", "paused_at_service": service_name, "is_success": None}
            )
            self._log_event(
                analysis_id, "info",
                f"Pipeline pausado después de {service_name}. Esperando aprobación del usuario.",
                {"paused_at_service": service_name}
            )
            logger.info(
                f"Pipeline paused after {service_name} for analysis_id={analysis_id}. "
                f"Awaiting approval."
            )
            self._notify_by_email(analysis_id, "awaiting_approval")
            return []

        # Find and launch next jobs
        next_jobs = get_next_jobs(service_name)
        launched = []

        for next_job in next_jobs:
            try:
                launched += self._launch_next_job(next_job, analysis_id, proposal_id, service_name)
            except Exception as e:
                logger.error(
                    f"Failed to launch job {next_job} after {service_name}: {e}"
                )
                try:
                    workflow_step_service.fail_step_by_service(str(analysis_id), next_job)
                except Exception as step_error:
                    logger.error(f"Failed to fail workflow step for {next_job}: {step_error}")
                self._log_event(analysis_id, "error", f"Failed to start job {next_job}", {"error": str(e)})
                analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})

        if is_final_job(service_name):
            analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": True})
            logger.info(
                f"Pipeline completed for analysis_id={analysis_id}. "
                f"Last job was: {service_name}"
            )
            self._notify_by_email(analysis_id, "completed")

        return launched

    def _launch_next_job(
        self,
        next_job: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID],
        previous_job: str,
    ) -> List[str]:
        """Launch the next job(s). If it's a fan-out job, launch one instance per file."""
        launched = []
        fan_out_type = get_fan_out_type(next_job)

        if fan_out_type in ("processed_file", "original_file", "merged_file", "file_with_metadata", "proposal"):
            if fan_out_type == "merged_file":
                items = processed_file_repository.get_merged_by_analysis_id(analysis_id)
            elif fan_out_type == "file_with_metadata":
                items = processed_file_repository.get_with_metadata_by_analysis_id(analysis_id)
            elif fan_out_type == "proposal":
                items = proposal_repository.get_by_analysis_id(analysis_id)
            elif fan_out_type == "original_file":
                items = original_file_repository.get_by_analysis_id(analysis_id)
            else:  # "processed_file"
                items = processed_file_repository.get_by_analysis_id(analysis_id)
            if not items:
                logger.warning(f"No {fan_out_type} items found for analysis_id={analysis_id}, skipping fan-out job {next_job}")
                return []

            logger.info(f"Fan-out: launching {len(items)} instances of {next_job} for analysis_id={analysis_id}")

            # Start workflow step once for the fan-out group
            try:
                workflow_step_service.start_step_by_service(str(analysis_id), next_job, instances_count=len(items))
            except Exception as step_error:
                logger.error(f"Failed to start workflow step for {next_job}: {step_error}")

            for item_data in items:
                item_id = item_data["id"]
                if fan_out_type == "proposal":
                    azure_response = self._launch_job(next_job, analysis_id, proposal_id=UUID(item_id))
                    self._log_event(analysis_id, "info", f"Started fan-out job {next_job} for proposal {item_id}", azure_response)
                    logger.info(f"Launched fan-out job: {next_job} proposal_id={item_id} for analysis_id={analysis_id}")
                elif fan_out_type == "original_file":
                    azure_response = self._launch_job(next_job, analysis_id, proposal_id, original_file_id=UUID(item_id))
                    self._log_event(analysis_id, "info", f"Started fan-out job {next_job} for original_file {item_id}", azure_response)
                    logger.info(f"Launched fan-out job: {next_job} original_file_id={item_id} for analysis_id={analysis_id}")
                else:
                    azure_response = self._launch_job(next_job, analysis_id, proposal_id, file_id=UUID(item_id))
                    self._log_event(analysis_id, "info", f"Started fan-out job {next_job} for file {item_id}", azure_response)
                    logger.info(f"Launched fan-out job: {next_job} file_id={item_id} for analysis_id={analysis_id}")
                launched.append(next_job)
        else:
            # Fan-in gate: if multiple services converge to next_job, wait for all to complete.
            parent_jobs = get_parent_jobs(next_job)
            if len(parent_jobs) > 1:
                for parent in parent_jobs:
                    if not workflow_step_service.is_step_completed_by_service(str(analysis_id), parent):
                        logger.info(
                            f"Fan-in: {parent} not yet completed, deferring launch of {next_job} "
                            f"for analysis_id={analysis_id}"
                        )
                        return launched

            # Atomic gate: only proceed if we can claim the step (pending → running).
            # Prevents duplicate Azure launches when multiple concurrent fan-out
            # callbacks all pass the completed >= total check simultaneously.
            claimed = workflow_step_service.start_step_by_service_if_pending(str(analysis_id), next_job)
            if not claimed:
                logger.warning(
                    f"Skipping duplicate launch of {next_job} for analysis_id={analysis_id} "
                    f"— step already claimed by another callback"
                )
                return launched
            azure_response = self._launch_job(next_job, analysis_id, proposal_id)
            self._log_event(analysis_id, "info", f"Started job {next_job}", azure_response)
            launched.append(next_job)
            logger.info(f"Launched next job: {next_job} after {previous_job} for analysis_id={analysis_id}")

        return launched

    def _launch_job(
        self,
        service_name: str,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
        file_id: Optional[UUID] = None,
        original_file_id: Optional[UUID] = None,
    ) -> dict:
        """Launch a single Azure Container Apps Job and create a record in the jobs table."""
        image = f"{self.registry}/{service_name}:latest"

        env_vars = [
            {"name": "ANALYSIS_ID", "value": str(analysis_id)},
            {"name": "PROPOSAL_ID", "value": str(proposal_id) if proposal_id else ""},
        ]

        effective_file_id = file_id or original_file_id
        if effective_file_id:
            env_vars.append({"name": "FILE_ID", "value": str(effective_file_id)})

        template = {
            "containers": [
                {
                    "name": service_name,
                    "image": image,
                    "env": env_vars,
                }
            ]
        }

        logger.info(
            f"Launching Azure job: {service_name} with image: {image}"
            + (f" for file_id={file_id}" if file_id else "")
            + (f" for original_file_id={original_file_id}" if original_file_id else "")
        )

        poller = self.client.jobs.begin_start(
            resource_group_name=self.resource_group,
            job_name=service_name,
            template=template,
        )

        result = poller.result()
        azure_response = result.as_dict() if result else {}

        input_payload = {
            "ANALYSIS_ID": str(analysis_id),
            "PROPOSAL_ID": str(proposal_id) if proposal_id else "",
        }
        if effective_file_id:
            input_payload["FILE_ID"] = str(effective_file_id)

        job_record = {
            "analysis_id": str(analysis_id),
            "service_name": service_name,
            "azure_execution_id": azure_response.get("id", ""),
            "execution_name": azure_response.get("name", ""),
            "input_payload": input_payload,
        }
        if file_id:
            job_record["file_id"] = str(file_id)
        if original_file_id:
            job_record["original_file_id"] = str(original_file_id)
        if proposal_id:
            job_record["proposal_id"] = str(proposal_id)
        job_repository.create(job_record)

        return azure_response

    def resume_pipeline(self, analysis_id: UUID) -> List[str]:
        """Resume a paused pipeline after user approval."""
        analysis = analysis_repository.get_by_id(str(analysis_id))
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")
        if analysis["status"] != "awaiting_approval":
            raise ValueError(
                f"Analysis {analysis_id} is not awaiting approval "
                f"(current status: {analysis['status']})"
            )

        paused_at_service = analysis.get("paused_at_service")
        if not paused_at_service:
            raise ValueError(f"Analysis {analysis_id} has no paused_at_service recorded")

        # Lock file reordering before launching service-joiner
        if paused_at_service == "service-documents-grouper":
            original_file_repository.lock_reordering(str(analysis_id))
            logger.info(f"Set is_reorderable=False for all original files in analysis {analysis_id}")

        # Clear paused state, return to processing
        analysis_repository.update_by_id(
            str(analysis_id),
            {"status": "processing", "paused_at_service": None}
        )

        # Launch next jobs from where we paused
        next_jobs = get_next_jobs(paused_at_service)
        launched = []

        for next_job in next_jobs:
            try:
                launched += self._launch_next_job(next_job, analysis_id, None, paused_at_service)
            except Exception as e:
                logger.error(f"Failed to launch job {next_job} during resume: {e}")
                try:
                    workflow_step_service.fail_step_by_service(str(analysis_id), next_job)
                except Exception as step_error:
                    logger.error(f"Failed to fail workflow step for {next_job}: {step_error}")
                self._log_event(analysis_id, "error", f"Failed to start job {next_job}", {"error": str(e)})
                analysis_repository.update_by_id(str(analysis_id), {"status": "ready", "is_success": False})

        self._log_event(
            analysis_id, "info",
            f"Pipeline reanudado. Jobs lanzados: {', '.join(launched)}",
            {"launched_jobs": launched}
        )
        logger.info(f"Pipeline resumed for analysis_id={analysis_id}. Launched: {launched}")

        return launched

    def cancel_pipeline(self, analysis_id: UUID) -> int:
        """Cancel all running jobs for an analysis and stop their Azure executions."""
        running_jobs = job_repository.get_running_jobs(str(analysis_id))

        # Stop each running Azure execution (best-effort)
        for job in running_jobs:
            execution_name = job.get("execution_name")
            service_name = job.get("service_name")
            if execution_name and service_name:
                try:
                    self.client.jobs.begin_stop_execution(
                        resource_group_name=self.resource_group,
                        job_name=service_name,
                        job_execution_name=execution_name,
                    )
                    logger.info(f"Stopped Azure execution {execution_name} for job {service_name}")
                except Exception as e:
                    logger.warning(f"Failed to stop Azure execution {execution_name} for job {service_name}: {e}")

        # Cancel all non-terminal jobs in DB
        cancelled = job_repository.cancel_all_jobs(str(analysis_id))
        cancelled_count = len(cancelled) if cancelled else 0

        # Update analysis status
        analysis_repository.update_by_id(str(analysis_id), {"status": "cancelled"})

        self._log_event(analysis_id, "info", f"Pipeline cancelled. {cancelled_count} jobs stopped.", {"cancelled_jobs": cancelled_count})
        logger.info(f"Pipeline cancelled for analysis_id={analysis_id}. {cancelled_count} jobs cancelled.")

        return cancelled_count

    def fail_timed_out_analysis(self, analysis_id: str, timed_out_step_codes: list) -> None:
        """Marca un análisis como fallido por timeout. Llamado por el background monitor."""
        from uuid import UUID
        analysis_uuid = UUID(analysis_id)

        logger.warning(
            f"[JobMonitor] Timing out analysis_id={analysis_id}. "
            f"Timed-out steps: {timed_out_step_codes}"
        )

        # Detener Azure executions — best-effort
        running_jobs = job_repository.get_running_jobs(analysis_id)
        for job in running_jobs:
            execution_name = job.get("execution_name")
            service_name = job.get("service_name")
            if execution_name and service_name:
                try:
                    self.client.jobs.begin_stop_execution(
                        resource_group_name=self.resource_group,
                        job_name=service_name,
                        job_execution_name=execution_name,
                    )
                    logger.info(
                        f"[JobMonitor] Stopped Azure execution {execution_name} "
                        f"for job {service_name} (analysis_id={analysis_id})"
                    )
                except Exception as e:
                    logger.warning(
                        f"[JobMonitor] Failed to stop Azure execution {execution_name} "
                        f"for job {service_name}: {e}"
                    )

        # Marcar todos los jobs no-terminales como failed
        job_repository.fail_all_running_jobs(analysis_id)

        # Marcar los workflow steps timed-out como failed
        for code in timed_out_step_codes:
            try:
                workflow_step_repository.update_status_by_code(analysis_uuid, code, "failed")
            except Exception as e:
                logger.error(f"[JobMonitor] Failed to update workflow step {code} to failed: {e}")

        # Marcar el análisis como fallido
        analysis_repository.update_by_id(
            analysis_id,
            {"status": "ready", "is_success": False}
        )

        self._log_event(
            analysis_uuid,
            "error",
            f"Análisis cancelado por timeout. Steps timed-out: {timed_out_step_codes}",
            {"timed_out_steps": timed_out_step_codes, "source": "job_monitor"},
        )

    def _notify_by_email(self, analysis_id: UUID, reason: str) -> None:
        """Send email notification if user_email is set and belongs to the allowed domain."""
        analysis = analysis_repository.get_by_id(analysis_id)
        if not analysis:
            return
        user_email = analysis.get("user_email")
        if not user_email:
            return
        try:
            if reason == "awaiting_approval":
                email_service.send_awaiting_approval(str(analysis_id), user_email)
            elif reason == "completed":
                email_service.send_pipeline_completed(str(analysis_id), user_email)
            elif reason == "failed":
                email_service.send_pipeline_failed(str(analysis_id), user_email)
            else:
                return
            self._log_event(
                analysis_id, "info",
                f"Notificacion por email enviada",
                {"to": user_email, "reason": reason},
            )
        except Exception as e:
            logger.error(f"Failed to send {reason} email for analysis_id={analysis_id}: {e}")

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

