from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class EventRepository(BaseRepository):
    def __init__(self):
        super().__init__("events")

    def get_by_analysis_id(self, analysis_id: UUID, limit: int, offset: int) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data

event_repository = EventRepository()
