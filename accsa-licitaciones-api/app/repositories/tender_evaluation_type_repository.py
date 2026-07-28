from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any


class TenderEvaluationTypeRepository(BaseRepository):
    def __init__(self):
        super().__init__("tender_evaluation_types")

    def get_all(self) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .order("id")
            .execute()
        )
        return response.data or []

    def get_by_label(self, label: str) -> Dict[str, Any] | None:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("label", label)
            .single()
            .execute()
        )
        return response.data if response.data else None


tender_evaluation_type_repository = TenderEvaluationTypeRepository()
