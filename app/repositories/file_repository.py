from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class FileRepository(BaseRepository):
    def __init__(self):
        super().__init__("files_view")

    def get_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .execute()
        )
        return response.data

    def get_merged_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .eq("is_merged", True)
            .execute()
        )
        return response.data

    def create_file(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table("files").insert(data).execute()
        return response.data[0]

    def update_file_by_id(self, file_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table("files").update(data).eq("id", file_id).execute()
        return response.data[0] if response.data else None

file_repository = FileRepository()
