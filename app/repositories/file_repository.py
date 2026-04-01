from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class FileRepository(BaseRepository):
    def __init__(self):
        super().__init__("files_view")

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

    def get_processed_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .eq("is_processed_version", True)
            .execute()
        )
        return response.data

    def get_processed_with_metadata_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .eq("is_processed_version", True)
            .not_.is_("metadata", None)
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

    def update_files_by_link(self, link: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        response = supabase.table("files").update(data).eq("link", link).execute()
        return response.data

    def update_files_by_analysis_id(self, analysis_id: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        response = supabase.table("files").update(data).eq("analysis_id", analysis_id).execute()
        return response.data

file_repository = FileRepository()
