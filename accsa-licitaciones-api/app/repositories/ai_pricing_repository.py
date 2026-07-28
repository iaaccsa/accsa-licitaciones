from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Dict, Any, List, Optional


class AiPricingRepository(BaseRepository):
    def __init__(self):
        super().__init__("ai_pricing")

    def get_all_active(self) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("is_active", True)
            .order("operation")
            .order("provider")
            .order("model")
            .execute()
        )
        return response.data

    def get_by_provider_model_operation(
        self, provider: str, model: str, operation: str
    ) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("provider", provider)
            .eq("model", model)
            .eq("operation", operation)
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        return response.data if response else None


ai_pricing_repository = AiPricingRepository()
