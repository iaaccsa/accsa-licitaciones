from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Dict, List, Any, Optional


class AnalysisRequirementRepository(BaseRepository):
    def __init__(self):
        super().__init__("analysis_requirements")

    def delete_by_analysis_id(self, analysis_id: str) -> int:
        response = (
            supabase.table(self.table_name)
            .delete()
            .eq("analysis_id", analysis_id)
            .execute()
        )
        return len(response.data)

    def insert_batch(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        response = supabase.table(self.table_name).insert(data).execute()
        return response.data

    def get_by_analysis_id(
        self,
        analysis_id: str,
        domain: Optional[str] = None,
        role: Optional[str] = None,
        factor_id: Optional[str] = None,
        is_verified: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        q = supabase.table(self.table_name).select("*").eq("analysis_id", analysis_id)
        if domain is not None:
            q = q.eq("domain", domain)
        if role is not None:
            q = q.contains("roles", [role])
        if factor_id is not None:
            q = q.contains("mapped_factors", [{"factor_id": factor_id}])
        if is_verified is not None:
            q = q.eq("is_verified", is_verified)
        return q.order("requirement_code").range(offset, offset + limit - 1).execute().data

    def get_by_id(self, requirement_id: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("id", requirement_id)
            .maybe_single()
            .execute()
        )
        return response.data

    def update_by_id(self, requirement_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .update(data)
            .eq("id", requirement_id)
            .execute()
        )
        return response.data[0] if response.data else None


analysis_requirement_repository = AnalysisRequirementRepository()
