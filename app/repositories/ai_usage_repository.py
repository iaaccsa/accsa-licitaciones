from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Any, Dict, List


class AiUsageRepository(BaseRepository):
    def __init__(self):
        super().__init__("ai_usage")

    def get_by_analysis_id(self, analysis_id: str) -> List[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("proposal_id, provider, model, operation, cost_usd, currency")
            .eq("analysis_id", analysis_id)
            .execute()
        )
        return response.data


ai_usage_repository = AiUsageRepository()
