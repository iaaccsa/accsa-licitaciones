from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.proposal import Proposal, ProposalFilter
from app.services.proposal_service import proposal_service

router = APIRouter()

@router.post("/search", response_model=List[Proposal])
def search_proposals(filter_params: ProposalFilter):
    """
    Search proposals by analysis_id.
    """
    try:
        return proposal_service.search_proposals(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
