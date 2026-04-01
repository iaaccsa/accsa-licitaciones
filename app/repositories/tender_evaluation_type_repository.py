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


tender_evaluation_type_repository = TenderEvaluationTypeRepository()
