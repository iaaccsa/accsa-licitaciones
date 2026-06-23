from typing import Any, Dict, List, Optional

from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase


class ServicePromptRepository(BaseRepository):
    def __init__(self):
        super().__init__("service_prompts")

    def list_all(self) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .order("service")
            .order("filename")
            .execute()
        )
        return response.data

    def get_by_key(self, key: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("key", key)
            .maybe_single()
            .execute()
        )
        return response.data if response else None

    def update_by_key(self, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        record = {**payload, "updated_at": "now()"}
        response = (
            supabase.table(self.table_name)
            .update(record)
            .eq("key", key)
            .execute()
        )
        return response.data[0]

    def upsert(self, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        record = {**payload, "key": key, "updated_at": "now()"}
        response = (
            supabase.table(self.table_name)
            .upsert(record, on_conflict="key")
            .execute()
        )
        return response.data[0]


service_prompt_repository = ServicePromptRepository()
