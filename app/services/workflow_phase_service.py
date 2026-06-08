from app.repositories.workflow_phase_repository import workflow_phase_repository
from app.repositories.workflow_step_repository import workflow_step_repository
from app.repositories.analysis_repository import analysis_repository
from app.schemas.workflow_phase import WorkflowPhase, WorkflowPhaseFilter
from app.config.jobs_config import get_phases, get_phase_for_step, get_steps_for_phase, get_next_phase, get_step_code_for_service
from datetime import datetime
from typing import List


def _auto_approval_label(display_name: str) -> str:
    return display_name.replace("Esperando Aprobación de ", "Sin aprobación: ")


class WorkflowPhaseService:
    def __init__(self):
        self.repository = workflow_phase_repository
        self.step_repository = workflow_step_repository

    def search_phases(self, filter_params: WorkflowPhaseFilter) -> List[WorkflowPhase]:
        data = self.repository.get_by_analysis_id(filter_params.analysis_id)
        return [WorkflowPhase(**item) for item in data]

    def initialize_phases(self, analysis_id: str, hitl: bool = True) -> List[WorkflowPhase]:
        phases = get_phases()
        records = [
            {
                "analysis_id": analysis_id,
                "code": p["code"],
                "display_name": (
                    _auto_approval_label(p["display_name"])
                    if not hitl and p.get("type") == "approval"
                    else p["display_name"]
                ),
                "status": "pending",
                "progress": 0,
                "order": p["order"],
                "type": p.get("type", "processing"),
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
            "type": phase_meta.get("type", "processing"),
        }

        if new_status in ("running", "completed", "failed"):
            if existing and existing.get("started_at"):
                upsert_data["started_at"] = existing["started_at"]
            else:
                upsert_data["started_at"] = now

        if new_status in ("completed", "failed"):
            upsert_data["ended_at"] = now

        self.repository.upsert(upsert_data)

        if new_status == "completed":
            next_phase = get_next_phase(phase_code)
            if next_phase and next_phase.get("type") == "approval":
                analysis = analysis_repository.get_by_id(analysis_id)
                if analysis and analysis.get("hitl") is False:
                    self._autocomplete_approval_phase(analysis_id, next_phase, now)
                else:
                    self._activate_approval_phase(analysis_id, next_phase, now)

    def complete_approval_phase_after_service(self, analysis_id: str, service_name: str) -> None:
        """Complete the approval phase activated after service_name's processing phase."""
        step_code = get_step_code_for_service(service_name)
        if not step_code:
            return
        processing_phase_code = get_phase_for_step(step_code)
        if not processing_phase_code:
            return
        next_phase = get_next_phase(processing_phase_code)
        if not next_phase or next_phase.get("type") != "approval":
            return
        now = datetime.now().isoformat()
        existing = self.repository.get_by_analysis_and_code(analysis_id, next_phase["code"])
        self.repository.upsert({
            "analysis_id": analysis_id,
            "code": next_phase["code"],
            "display_name": next_phase["display_name"],
            "status": "completed",
            "progress": 100,
            "order": next_phase["order"],
            "type": "approval",
            "started_at": existing.get("started_at") if existing else now,
            "ended_at": now,
        })

    def _autocomplete_approval_phase(self, analysis_id: str, phase_meta: dict, now: str) -> None:
        existing = self.repository.get_by_analysis_and_code(analysis_id, phase_meta["code"])
        if existing and existing.get("status") == "completed":
            return
        self.repository.upsert({
            "analysis_id": analysis_id,
            "code": phase_meta["code"],
            "display_name": _auto_approval_label(phase_meta["display_name"]),
            "status": "completed",
            "progress": 100,
            "order": phase_meta["order"],
            "type": phase_meta.get("type", "approval"),
            "started_at": existing.get("started_at") if existing else now,
            "ended_at": now,
        })

    def _activate_approval_phase(self, analysis_id: str, phase_meta: dict, now: str) -> None:
        existing = self.repository.get_by_analysis_and_code(analysis_id, phase_meta["code"])
        if existing and existing.get("status") in ("running", "completed"):
            return
        self.repository.upsert({
            "analysis_id": analysis_id,
            "code": phase_meta["code"],
            "display_name": phase_meta["display_name"],
            "status": "running",
            "progress": 0,
            "order": phase_meta["order"],
            "type": phase_meta.get("type", "approval"),
            "started_at": now,
        })


workflow_phase_service = WorkflowPhaseService()
