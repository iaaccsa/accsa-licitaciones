from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class OriginalFileRepository(BaseRepository):
    def __init__(self):
        super().__init__("original_files_view")

    def get_by_id(self, file_id: str) -> Dict[str, Any] | None:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("id", file_id)
            .maybe_single()
            .execute()
        )
        return response.data

    def get_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .execute()
        )
        return response.data

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table("original_files").insert(data).execute()
        return response.data[0]

    def update_by_id(self, file_id: str, data: Dict[str, Any]) -> Dict[str, Any] | None:
        response = supabase.table("original_files").update(data).eq("id", file_id).execute()
        return response.data[0] if response.data else None

    def lock_reordering(self, analysis_id: str) -> List[Dict[str, Any]]:
        response = (
            supabase.table("original_files")
            .update({"is_reorderable": False})
            .eq("analysis_id", analysis_id)
            .execute()
        )
        return response.data

original_file_repository = OriginalFileRepository()
