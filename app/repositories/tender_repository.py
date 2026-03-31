from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class TenderRepository(BaseRepository):
    def __init__(self):
        super().__init__("tenders")

    def get_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table("tenders_view")
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .execute()
        )
        return response.data

    def get_by_id(self, tender_id: str) -> Dict[str, Any]:
        response = (
            supabase.table("tenders_view")
            .select("*")
            .eq("id", tender_id)
            .single()
            .execute()
        )
        return response.data if response.data else None

    def update_by_id(self, tender_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table(self.table_name).update(data).eq("id", tender_id).execute()
        return response.data[0] if response.data else None

tender_repository = TenderRepository()
