from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any, Optional, Set
from uuid import UUID
import datetime as dt


class ComplianceMatrixRepository(BaseRepository):
    def __init__(self):
        super().__init__("analysis_compliance_matrix")

    def validate_requirement_ids(self, analysis_id: UUID, req_ids: Set[str]) -> Set[str]:
        """Returns the subset of req_ids that do NOT exist in analysis_requirements for analysis_id."""
        response = (
            supabase.table("analysis_requirements")
            .select("id")
            .eq("analysis_id", str(analysis_id))
            .in_("id", list(req_ids))
            .execute()
        )
        found = {row["id"] for row in response.data}
        return req_ids - found

    def bulk_replace(self, analysis_id: UUID, proposal_id: UUID, rows: List[Dict[str, Any]]) -> tuple[int, int]:
        """Deletes all existing entries for (analysis_id, proposal_id) then inserts rows.
        Returns (inserted, deleted)."""
        delete_response = (
            supabase.table(self.table_name)
            .delete()
            .eq("analysis_id", str(analysis_id))
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
        deleted = len(delete_response.data)
        if rows:
            supabase.table(self.table_name).insert(rows).execute()
        return len(rows), deleted

    def get_by_proposal(self, proposal_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*, analysis_requirements(*)")
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
        return response.data

    def get_by_analysis(self, analysis_id: UUID, proposal_id: Optional[UUID] = None) -> List[Dict[str, Any]]:
        q = (
            supabase.table(self.table_name)
            .select("*, analysis_requirements(*)")
            .eq("analysis_id", str(analysis_id))
        )
        if proposal_id:
            q = q.eq("proposal_id", str(proposal_id))
        return q.execute().data

    def get_by_requirement(self, requirement_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("requirement_id", str(requirement_id))
            .execute()
        )
        return response.data

    def get_view_by_proposal(
        self,
        proposal_id: UUID,
        verification_method: Optional[str] = None,
        role: Optional[str] = None,
        is_admissibility: Optional[bool] = None,
        order: str = "asc",
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        q = (
            supabase.table("analysis_compliance_matrix_view")
            .select("*")
            .eq("proposal_id", str(proposal_id))
            .order("requirement_code", desc=(order == "desc"))
        )
        if verification_method:
            q = q.eq("requirement_verification_method", verification_method)
        if role:
            q = q.contains("requirement_roles", [role])
        if is_admissibility is not None:
            q = q.eq("requirement_is_admissibility", is_admissibility)
        q = q.range(offset, offset + limit - 1)
        return q.execute().data

    def get_by_id(self, entry_id: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("id", entry_id)
            .maybe_single()
            .execute()
        )
        return response.data

    def delete_by_proposal(self, proposal_id: UUID) -> int:
        response = (
            supabase.table(self.table_name)
            .delete()
            .eq("proposal_id", str(proposal_id))
            .execute()
        )
        return len(response.data)

    def batch_insert(self, rows: List[Dict[str, Any]]) -> int:
        if not rows:
            return 0
        supabase.table(self.table_name).insert(rows).execute()
        return len(rows)

    def update_patch(self, entry_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .update(data)
            .eq("id", entry_id)
            .execute()
        )
        return response.data[0] if response.data else None


compliance_matrix_repository = ComplianceMatrixRepository()
