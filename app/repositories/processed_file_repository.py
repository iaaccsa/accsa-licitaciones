from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import List, Dict, Any
from uuid import UUID

class ProcessedFileRepository(BaseRepository):
    def __init__(self):
        super().__init__("processed_files_view")

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

    def get_merged_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .eq("is_merged", True)
            .execute()
        )
        return response.data

    def get_with_metadata_by_analysis_id(self, analysis_id: UUID) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", str(analysis_id))
            .not_.is_("metadata", None)
            .execute()
        )
        return response.data

    def get_by_original_file_id(self, original_file_id: str) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("original_file_id", original_file_id)
            .execute()
        )
        return response.data

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table("processed_files").insert(data).execute()
        return response.data[0]

    def update_by_id(self, file_id: str, data: Dict[str, Any]) -> Dict[str, Any] | None:
        response = supabase.table("processed_files").update(data).eq("id", file_id).execute()
        return response.data[0] if response.data else None

    def update_by_original_file_id(self, original_file_id: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        response = (
            supabase.table("processed_files")
            .update(data)
            .eq("original_file_id", original_file_id)
            .execute()
        )
        return response.data

    def delete_by_analysis_id(self, analysis_id: str, is_merged: bool | None = None) -> int:
        query = supabase.table("processed_files").delete().eq("analysis_id", analysis_id)
        if is_merged is not None:
            query = query.eq("is_merged", is_merged)
        response = query.execute()
        return len(response.data)

    def null_proposal_id_by_analysis_id(self, analysis_id: str) -> None:
        supabase.table("processed_files").update({"proposal_id": None}).eq("analysis_id", analysis_id).execute()

    def null_tender_id_by_analysis_id(self, analysis_id: str) -> None:
        supabase.table("processed_files").update({"tender_id": None}).eq("analysis_id", analysis_id).execute()

processed_file_repository = ProcessedFileRepository()
