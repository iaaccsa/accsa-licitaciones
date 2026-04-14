from app.repositories.workflow_step_repository import workflow_step_repository
from app.schemas.workflow_step import WorkflowStep, WorkflowStepBase, WorkflowStepFilter
from app.services.workflow_phase_service import workflow_phase_service
import json
import os
from datetime import datetime
from typing import List, Optional

class WorkflowStepService:
    def __init__(self):
        self.repository = workflow_step_repository

    def search_steps(self, filter_params: WorkflowStepFilter) -> List[WorkflowStep]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [WorkflowStep(**item) for item in data]

    def upsert_step(self, step_data: WorkflowStepBase) -> WorkflowStep:
        data = self.repository.upsert(step_data.model_dump(mode="json", exclude_none=True))
        # Mark parent step as completed
        if step_data.parent_code:
            self.repository.update_status_by_code(
                analysis_id=step_data.analysis_id,
                code=step_data.parent_code,
                status="completed"
            )
        return WorkflowStep(**data)

    def initialize_steps(self, analysis_id: str) -> List[WorkflowStep]:
        now = datetime.now()
        
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config', 'pipeline_config.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            steps_config = json.load(f)
            
        steps = []
        for item in steps_config:
            if item.get("create_on_start"):
                step = {
                    "analysis_id": str(analysis_id),
                    "code": item["code"],
                    "display_name": item["display_name"],
                    "status": item["initial_status"],
                    "parent_code": item.get("parent"),
                    "started_at": now.isoformat() if item.get("is_initial") else None,
                    "ended_at": None
                }
                steps.append(step)
        
        data = self.repository.create_batch(steps)
        return [WorkflowStep(**item) for item in data]

    def _get_step_config_by_service(self, service_name: str) -> dict:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config', 'pipeline_config.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            steps_config = json.load(f)
        for item in steps_config:
            if item.get("service") == service_name:
                return item
        return {}

    def complete_step_by_service(self, analysis_id: str, service_name: str) -> Optional[WorkflowStep]:
        config = self._get_step_config_by_service(service_name)
        code = config.get("code")
        if not code:
            return None

        update_data = {
            "analysis_id": analysis_id,
            "code": code,
            "display_name": config.get("display_name", ""),
            "status": "completed",
            "ended_at": datetime.now().isoformat()
        }

        data = self.repository.upsert(update_data)
        workflow_phase_service.update_phase_progress(analysis_id, code)
        return WorkflowStep(**data) if data else None

    def start_step_by_service(self, analysis_id: str, service_name: str, instances_count: int = 0) -> Optional[WorkflowStep]:
        config = self._get_step_config_by_service(service_name)
        code = config.get("code")
        if not code:
            return None

        update_data = {
            "analysis_id": analysis_id,
            "code": code,
            "display_name": config.get("display_name", ""),
            "status": "running",
            "parent_code": config.get("parent"),
            "instances_count": instances_count,
            "started_at": datetime.now().isoformat()
        }

        data = self.repository.upsert(update_data)
        return WorkflowStep(**data) if data else None

    def complete_step_by_service_if_running(self, analysis_id: str, service_name: str) -> bool:
        config = self._get_step_config_by_service(service_name)
        code = config.get("code")
        if not code:
            return False
        return self.repository.complete_step_if_running(analysis_id, code)

    def start_step_by_service_if_pending(self, analysis_id: str, service_name: str) -> bool:
        config = self._get_step_config_by_service(service_name)
        code = config.get("code")
        if not code:
            return False
        return self.repository.claim_step_if_pending(analysis_id, code)

    def fail_step_by_service(self, analysis_id: str, service_name: str) -> Optional[WorkflowStep]:
        config = self._get_step_config_by_service(service_name)
        code = config.get("code")
        if not code:
            return None

        update_data = {
            "analysis_id": analysis_id,
            "code": code,
            "display_name": config.get("display_name", ""),
            "status": "failed",
            "ended_at": datetime.now().isoformat()
        }

        data = self.repository.upsert(update_data)
        workflow_phase_service.update_phase_progress(analysis_id, code)
        return WorkflowStep(**data) if data else None

workflow_step_service = WorkflowStepService()
