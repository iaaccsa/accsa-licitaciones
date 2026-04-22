from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from uuid import UUID
from app.schemas.proposal import (
    ProposalRead, ProposalCreate, ProposalUpdate,
    ProposalMatchingStart, ProposalMatchingResult, ProposalMatchingFailure,
    ProposalSummaryStart, ProposalSummaryResult, ProposalSummaryFailure,
    ProposalMatchingStatus,
    ProposalAdmissibilityStart, ProposalAdmissibilityResult,
    ProposalAdmissibilityFailure, ProposalAdmissibilityOverride,
)
from app.services.proposal_service import proposal_service

router = APIRouter()


@router.post("/", response_model=ProposalRead)
def create_proposal(proposal_data: ProposalCreate):
    try:
        return proposal_service.create_proposal(proposal_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-analysis/{analysis_id}", response_model=List[ProposalRead])
def list_proposals_by_analysis(
    analysis_id: UUID,
    matching_status: Optional[ProposalMatchingStatus] = None,
):
    try:
        proposals = proposal_service.get_by_analysis_id(analysis_id)
        if matching_status:
            proposals = [p for p in proposals if p.matching_status == matching_status]
        return proposals
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{proposal_id}", response_model=ProposalRead)
def get_proposal(proposal_id: UUID):
    return proposal_service.get_proposal_by_id(str(proposal_id))


@router.patch("/{proposal_id}", response_model=ProposalRead)
def update_proposal(proposal_id: UUID, update_data: ProposalUpdate):
    return proposal_service.update_proposal(str(proposal_id), update_data)


@router.patch("/{proposal_id}/matching-start", response_model=ProposalRead)
def matching_start(proposal_id: UUID, body: ProposalMatchingStart):
    return proposal_service.matching_start(str(proposal_id), body)


@router.patch("/{proposal_id}/matching-result", response_model=ProposalRead)
def matching_result(proposal_id: UUID, body: ProposalMatchingResult):
    return proposal_service.matching_result(str(proposal_id), body)


@router.patch("/{proposal_id}/matching-failure", response_model=ProposalRead)
def matching_failure(proposal_id: UUID, body: ProposalMatchingFailure):
    return proposal_service.matching_failure(str(proposal_id), body)


@router.patch("/{proposal_id}/summary-start", response_model=ProposalRead)
def summary_start(proposal_id: UUID, body: ProposalSummaryStart):
    return proposal_service.summary_start(str(proposal_id), body)


@router.patch("/{proposal_id}/summary-result", response_model=ProposalRead)
def summary_result(proposal_id: UUID, body: ProposalSummaryResult):
    return proposal_service.summary_result(str(proposal_id), body)


@router.patch("/{proposal_id}/summary-failure", response_model=ProposalRead)
def summary_failure(proposal_id: UUID, body: ProposalSummaryFailure):
    return proposal_service.summary_failure(str(proposal_id), body)


@router.patch("/{proposal_id}/admissibility-start", response_model=ProposalRead)
def admissibility_start(proposal_id: UUID, body: ProposalAdmissibilityStart, force: bool = Query(False)):
    return proposal_service.admissibility_start(str(proposal_id), body, force)


@router.patch("/{proposal_id}/admissibility-result", response_model=ProposalRead)
def admissibility_result(proposal_id: UUID, body: ProposalAdmissibilityResult):
    return proposal_service.admissibility_result(str(proposal_id), body)


@router.patch("/{proposal_id}/admissibility-failure", response_model=ProposalRead)
def admissibility_failure(proposal_id: UUID, body: ProposalAdmissibilityFailure):
    return proposal_service.admissibility_failure(str(proposal_id), body)


@router.patch("/{proposal_id}/admissibility-override", response_model=ProposalRead)
def admissibility_override(proposal_id: UUID, body: ProposalAdmissibilityOverride):
    return proposal_service.admissibility_override(str(proposal_id), body)
