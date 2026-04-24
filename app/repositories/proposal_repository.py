from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class ProposalRepository(BaseRepository):
    def __init__(self):
        super().__init__("proposals")

    def get_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table("proposals_view")
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .execute()
        )
        return response.data

    def get_by_id(self, proposal_id: str) -> Dict[str, Any]:
        response = (
            supabase.table("proposals")
            .select("*")
            .eq("id", proposal_id)
            .single()
            .execute()
        )
        return response.data if response.data else None

    def get_admitidas_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table("proposals_view")
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .eq("admissibility_status", "admitida")
            .execute()
        )
        return response.data

    def update_by_id(self, proposal_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table(self.table_name).update(data).eq("id", proposal_id).execute()
        return response.data[0] if response.data else None

    def delete_by_analysis_id(self, analysis_id: str) -> int:
        response = (
            supabase.table("proposals")
            .delete()
            .eq("analysis_id", analysis_id)
            .execute()
        )
        return len(response.data)

proposal_repository = ProposalRepository()
