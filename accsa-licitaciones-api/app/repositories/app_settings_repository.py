from typing import Any, Dict, Optional

from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase


class AppSettingsRepository(BaseRepository):
    def __init__(self):
        super().__init__("app_settings")

    def get_by_key(self, key: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("key", key)
            .maybe_single()
            .execute()
        )
        return response.data if response else None

    def upsert_value(self, key: str, value: Dict[str, Any]) -> Dict[str, Any]:
        response = (
            supabase.table(self.table_name)
            .upsert({"key": key, "value": value, "updated_at": "now()"})
            .execute()
        )
        return response.data[0]


app_settings_repository = AppSettingsRepository()
