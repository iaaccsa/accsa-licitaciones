from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from typing import Any, Dict, List, Optional


class EconomicOfferRepository(BaseRepository):
    def __init__(self):
        super().__init__("proposal_economic_offers")

    def get_by_proposal_id(self, proposal_id: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("proposal_id", proposal_id)
            .maybe_single()
            .execute()
        )
        return response.data if response else None

    def get_by_id(self, offer_id: str) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("id", offer_id)
            .maybe_single()
            .execute()
        )
        return response.data if response else None

    def get_by_analysis_id(
        self,
        analysis_id: str,
        currency: Optional[str] = None,
        is_verified: Optional[bool] = None,
        requires_manual_review: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        q = supabase.table(self.table_name).select("*").eq("analysis_id", analysis_id)
        if currency is not None:
            q = q.eq("currency", currency)
        if is_verified is not None:
            q = q.eq("is_verified", is_verified)
        if requires_manual_review is not None:
            q = q.eq("requires_manual_review", requires_manual_review)
        return q.range(offset, offset + limit - 1).execute().data

    def upsert_by_proposal_id(self, data: Dict[str, Any]) -> Dict[str, Any]:
        data["is_verified"] = False
        data["reviewed_by"] = None
        data["reviewed_at"] = None
        response = (
            supabase.table(self.table_name)
            .upsert(data, on_conflict="proposal_id")
            .execute()
        )
        return response.data[0]

    def update_by_id(self, offer_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        response = (
            supabase.table(self.table_name)
            .update(data)
            .eq("id", offer_id)
            .execute()
        )
        return response.data[0] if response.data else None


economic_offer_repository = EconomicOfferRepository()
