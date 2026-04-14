from app.repositories.workflow_phase_repository import workflow_phase_repository
from app.repositories.workflow_step_repository import workflow_step_repository
from app.schemas.workflow_phase import WorkflowPhase, WorkflowPhaseFilter
from app.config.jobs_config import get_phases, get_phase_for_step, get_steps_for_phase
from datetime import datetime
from typing import List


class WorkflowPhaseService:
    def __init__(self):
        self.repository = workflow_phase_repository
        self.step_repository = workflow_step_repository

    def search_phases(self, filter_params: WorkflowPhaseFilter) -> List[WorkflowPhase]:
        data = self.repository.get_by_analysis_id(filter_params.analysis_id)
        return [WorkflowPhase(**item) for item in data]

    def initialize_phases(self, analysis_id: str) -> List[WorkflowPhase]:
        phases = get_phases()
        records = [
            {
                "analysis_id": analysis_id,
                "code": p["code"],
                "display_name": p["display_name"],
                "status": "pending",
                "progress": 0,
                "order": p["order"],
            }
            for p in phases
        ]
        data = self.repository.create_batch(records)
        return [WorkflowPhase(**item) for item in data]

    def update_phase_progress(self, analysis_id: str, step_code: str) -> None:
        phase_code = get_phase_for_step(step_code)
        if not phase_code:
            return

        phase_step_codes = get_steps_for_phase(phase_code)
        phase_meta = next((p for p in get_phases() if p["code"] == phase_code), None)
        if not phase_meta:
            return

        all_steps = self.step_repository.get_by_analysis_id(analysis_id)
        phase_steps = [s for s in all_steps if s["code"] in phase_step_codes]

        if not phase_steps:
            return

        total = len(phase_steps)
        completed = sum(1 for s in phase_steps if s["status"] == "completed")
        has_failed = any(s["status"] == "failed" for s in phase_steps)
        has_running = any(s["status"] == "running" for s in phase_steps)

        progress = int(completed / total * 100)

        if has_failed:
            new_status = "failed"
        elif progress == 100:
            new_status = "completed"
        elif has_running or completed > 0:
            new_status = "running"
        else:
            new_status = "pending"

        now = datetime.now().isoformat()

        existing = self.repository.get_by_analysis_and_code(analysis_id, phase_code)

        upsert_data = {
            "analysis_id": analysis_id,
            "code": phase_code,
            "display_name": phase_meta["display_name"],
            "status": new_status,
            "progress": progress,
            "order": phase_meta["order"],
        }

        if new_status in ("running", "completed", "failed"):
            if existing and existing.get("started_at"):
                upsert_data["started_at"] = existing["started_at"]
            else:
                upsert_data["started_at"] = now

        if new_status in ("completed", "failed"):
            upsert_data["ended_at"] = now

        self.repository.upsert(upsert_data)


workflow_phase_service = WorkflowPhaseService()
