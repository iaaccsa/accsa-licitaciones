from fastapi import APIRouter, HTTPException
from typing import List
from uuid import UUID
from app.schemas.proposal import Proposal, ProposalBase, ProposalFilter
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

@router.post("/", response_model=Proposal)
def create_proposal(proposal_data: ProposalBase):
    """
    Create a new proposal.
    """
    try:
        return proposal_service.create_proposal(proposal_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{proposal_id}", response_model=Proposal)
def get_proposal(proposal_id: UUID):
    result = proposal_service.get_proposal_by_id(str(proposal_id))
    if not result:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return result
