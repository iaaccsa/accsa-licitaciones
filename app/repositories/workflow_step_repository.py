from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from datetime import datetime
from typing import List, Dict, Any
from uuid import UUID

class WorkflowStepRepository(BaseRepository):
    def __init__(self):
        super().__init__("analysis_workflow_steps")

    def get_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .order("created_at", desc=False)
            .execute()
        )
        return response.data

    def upsert(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = (
            supabase.table(self.table_name)
            .upsert(data, on_conflict="analysis_id,code")
            .execute()
        )
        return response.data[0]

    def update_status_by_code(self, analysis_id: UUID, code: str, status: str) -> None:
        supabase.table(self.table_name) \
            .update({"status": status}) \
            .eq("analysis_id", str(analysis_id)) \
            .eq("code", code) \
            .execute()

    def start_step_by_code(self, analysis_id: str, code: str, instances_count: int) -> dict | None:
        """Explicit UPDATE to running with fresh started_at. Avoids upsert merge-duplicates bug."""
        from datetime import timezone
        response = (
            supabase.table(self.table_name)
            .update({
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "ended_at": None,
                "instances_count": instances_count,
            })
            .eq("analysis_id", analysis_id)
            .eq("code", code)
            .execute()
        )
        return response.data[0] if response.data else None

    def get_timed_out_steps(self, timeout_minutes: int) -> list:
        """Devuelve steps con status='running' cuyo started_at es más antiguo que timeout_minutes."""
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=timeout_minutes)
        response = (
            supabase.table(self.table_name)
            .select("analysis_id, code, started_at, status")
            .eq("status", "running")
            .lt("started_at", cutoff.isoformat())
            .execute()
        )
        return response.data

    def complete_step_if_running(self, analysis_id: str, code: str) -> bool:
        """Atomically transitions step from running to completed. Returns True if this call won."""
        response = (
            supabase.table(self.table_name)
            .update({"status": "completed", "ended_at": datetime.now().isoformat()})
            .eq("analysis_id", analysis_id)
            .eq("code", code)
            .eq("status", "running")
            .execute()
        )
        return bool(response.data)

    def claim_step_if_pending(self, analysis_id: str, code: str) -> bool:
        """Atomically transitions step from pending to running. Returns True if claimed."""
        response = (
            supabase.table(self.table_name)
            .update({"status": "running", "started_at": datetime.now().isoformat(), "instances_count": 1})
            .eq("analysis_id", analysis_id)
            .eq("code", code)
            .eq("status", "pending")
            .execute()
        )
        return bool(response.data)

    def get_step_status(self, analysis_id: str, code: str) -> str | None:
        response = (
            supabase.table(self.table_name)
            .select("status")
            .eq("analysis_id", analysis_id)
            .eq("code", code)
            .maybe_single()
            .execute()
        )
        return response.data["status"] if response.data else None

    def cancel_pending_by_analysis(self, analysis_id: str) -> int:
        """Cancel all workflow steps that are running or pending."""
        cancelled_count = 0
        for step_status in ["running", "pending"]:
            response = (
                supabase.table(self.table_name)
                .update({"status": "cancelled"})
                .eq("analysis_id", analysis_id)
                .eq("status", step_status)
                .execute()
            )
            cancelled_count += len(response.data) if response.data else 0
        return cancelled_count

workflow_step_repository = WorkflowStepRepository()
