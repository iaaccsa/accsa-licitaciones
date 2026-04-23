from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException

from app.repositories.economic_offer_repository import economic_offer_repository
from app.repositories.proposal_repository import proposal_repository
from app.schemas.economic_offer import (
    ProposalEconomicOfferCreate,
    ProposalEconomicOfferPatch,
    ProposalEconomicOfferRead,
)


class EconomicOfferService:
    def __init__(self):
        self.repository = economic_offer_repository

    def upsert(self, payload: ProposalEconomicOfferCreate) -> ProposalEconomicOfferRead:
        proposal = proposal_repository.get_by_id(str(payload.proposal_id))
        if not proposal:
            raise HTTPException(status_code=404, detail=f"Unknown proposal_id: {payload.proposal_id}")
        if str(proposal["analysis_id"]) != str(payload.analysis_id):
            raise HTTPException(status_code=422, detail="analysis_id does not match proposal.analysis_id")
        data = payload.model_dump(mode="json")
        data["analysis_id"] = str(payload.analysis_id)
        data["proposal_id"] = str(payload.proposal_id)
        row = self.repository.upsert_by_proposal_id(data)
        return ProposalEconomicOfferRead(**row)

    def get_by_proposal_id(self, proposal_id: UUID) -> ProposalEconomicOfferRead:
        row = self.repository.get_by_proposal_id(str(proposal_id))
        if not row:
            raise HTTPException(status_code=404, detail="Economic offer not found")
        return ProposalEconomicOfferRead(**row)

    def get_by_analysis_id(
        self,
        analysis_id: UUID,
        currency: Optional[str] = None,
        is_verified: Optional[bool] = None,
        requires_manual_review: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ProposalEconomicOfferRead]:
        rows = self.repository.get_by_analysis_id(
            analysis_id=str(analysis_id),
            currency=currency,
            is_verified=is_verified,
            requires_manual_review=requires_manual_review,
            limit=limit,
            offset=offset,
        )
        return [ProposalEconomicOfferRead(**r) for r in rows]

    def patch(self, offer_id: UUID, patch: ProposalEconomicOfferPatch) -> ProposalEconomicOfferRead:
        existing = self.repository.get_by_id(str(offer_id))
        if not existing:
            raise HTTPException(status_code=404, detail="Economic offer not found")
        data = patch.model_dump(mode="json", exclude_none=True)
        if data.get("is_verified") is True and "reviewed_at" not in data:
            data["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        if not data:
            return ProposalEconomicOfferRead(**existing)
        row = self.repository.update_by_id(str(offer_id), data)
        return ProposalEconomicOfferRead(**row)


economic_offer_service = EconomicOfferService()
