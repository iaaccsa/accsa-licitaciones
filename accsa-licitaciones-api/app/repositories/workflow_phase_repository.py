from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any, Optional
from uuid import UUID


class WorkflowPhaseRepository(BaseRepository):
    def __init__(self):
        super().__init__("analysis_workflow_phases")

    def get_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .order("order", desc=False)
            .execute()
        )
        return response.data

    def get_by_analysis_and_code(self, analysis_id: str, code: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", analysis_id)
            .eq("code", code)
            .execute()
        )
        return response.data[0] if response.data else None

    def upsert(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = (
            supabase.table(self.table_name)
            .upsert(data, on_conflict="analysis_id,code")
            .execute()
        )
        return response.data[0]


workflow_phase_repository = WorkflowPhaseRepository()
