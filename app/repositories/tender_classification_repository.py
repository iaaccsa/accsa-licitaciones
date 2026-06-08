from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Dict, Any, Optional


class TenderClassificationRepository(BaseRepository):
    def __init__(self):
        super().__init__("tender_classifications")

    def get_by_analysis_id(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", analysis_id)
            .maybe_single()
            .execute()
        )
        return response.data if response.data else None

    def upsert(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = (
            supabase.table(self.table_name)
            .upsert(data, on_conflict="analysis_id")
            .execute()
        )
        return response.data[0]


tender_classification_repository = TenderClassificationRepository()
