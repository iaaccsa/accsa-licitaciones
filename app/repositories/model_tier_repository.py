from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Dict, Any, List, Optional


class ModelTierRepository(BaseRepository):
    def __init__(self):
        super().__init__("model_tiers")

    def get_all_active(self) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("is_active", True)
            .order("provider")
            .order("sort_order")
            .execute()
        )
        return response.data

    def get_by_provider_level(self, provider: str, level: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("provider", provider)
            .eq("level", level)
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        return response.data if response else None


model_tier_repository = ModelTierRepository()
