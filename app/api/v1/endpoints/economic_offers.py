from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from uuid import UUID

from app.schemas.economic_offer import (
    ProposalEconomicOfferCreate,
    ProposalEconomicOfferPatch,
    ProposalEconomicOfferRead,
)
from app.services.economic_offer_service import economic_offer_service

router = APIRouter()


@router.post("/", response_model=ProposalEconomicOfferRead)
def upsert_economic_offer(payload: ProposalEconomicOfferCreate):
    try:
        return economic_offer_service.upsert(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-proposal/{proposal_id}", response_model=ProposalEconomicOfferRead)
def get_by_proposal(proposal_id: UUID):
    return economic_offer_service.get_by_proposal_id(proposal_id)


@router.get("/by-analysis/{analysis_id}", response_model=List[ProposalEconomicOfferRead])
def get_by_analysis(
    analysis_id: UUID,
    currency: Optional[str]              = Query(None),
    is_verified: Optional[bool]          = Query(None),
    requires_manual_review: Optional[bool] = Query(None),
    limit: int                           = Query(100, ge=1, le=500),
    offset: int                          = Query(0, ge=0),
):
    try:
        return economic_offer_service.get_by_analysis_id(
            analysis_id=analysis_id,
            currency=currency,
            is_verified=is_verified,
            requires_manual_review=requires_manual_review,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{offer_id}", response_model=ProposalEconomicOfferRead)
def patch_economic_offer(offer_id: UUID, patch: ProposalEconomicOfferPatch):
    try:
        return economic_offer_service.patch(offer_id, patch)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
