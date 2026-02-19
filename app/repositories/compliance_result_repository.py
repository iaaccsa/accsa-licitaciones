from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class ComplianceResultRepository(BaseRepository):
    def __init__(self):
        super().__init__("proposal_compliance_results_view")

    def get_by_proposal_id(self, proposal_id: UUID, limit: int, offset: int) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("proposal_id", str(proposal_id))
            .order("requirement_code", desc=False)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data

compliance_result_repository = ComplianceResultRepository()
