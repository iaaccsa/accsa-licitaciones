from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
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

workflow_step_repository = WorkflowStepRepository()
