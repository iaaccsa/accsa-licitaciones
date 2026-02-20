from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Dict, Any, Optional
from uuid import UUID

class AnalysisRepository(BaseRepository):
    def __init__(self):
        super().__init__("analyses")

    def get_by_id(self, analysis_id: UUID) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("id", str(analysis_id))
            .execute()
        )
        return response.data[0] if response.data else None

    def update_status(self, analysis_id: UUID, status: str) -> Dict[str, Any]:
        response = (
            supabase.table(self.table_name)
            .update({"status": status})
            .eq("id", str(analysis_id))
            .execute()
        )
        return response.data[0]

analysis_repository = AnalysisRepository()
