from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from uuid import UUID

from app.schemas.admissibility_result import (
    AdmissibilityResultEntryRead,
    AdmissibilityResultEntryReadWithRequirement,
    AdmissibilityResultEntryPatch,
    AdmissibilityResultEntryCreate,
    AdmissibilityResultEntryFlatCreate,
    AdmissibilityResultBulkCreate,
    BulkReplaceMatrixResponse,
    DeleteByProposalResponse,
    BatchInsertResponse,
    AdmissibilityVerdict,
)
from app.services.admissibility_result_service import admissibility_result_service

router = APIRouter()


@router.post("/bulk", response_model=BulkReplaceMatrixResponse)
def bulk_replace(items: List[AdmissibilityResultEntryFlatCreate]):
    if not items:
        raise HTTPException(status_code=422, detail="items list must not be empty")
    analysis_id = items[0].analysis_id
    proposal_id = items[0].proposal_id
    entries = [
        AdmissibilityResultEntryCreate(**item.model_dump(exclude={"analysis_id", "proposal_id"}))
        for item in items
    ]
    payload = AdmissibilityResultBulkCreate(
        analysis_id=analysis_id,
        proposal_id=proposal_id,
        entries=entries,
    )
    return admissibility_result_service.bulk_replace(payload)


@router.get("/by-proposal/{proposal_id}", response_model=List[AdmissibilityResultEntryReadWithRequirement])
def get_by_proposal(
    proposal_id: UUID,
    verdict: Optional[List[AdmissibilityVerdict]] = Query(default=None),
    role: Optional[List[str]]                  = Query(default=None),
    domain: Optional[str]                      = Query(default=None),
    is_verified: Optional[bool]                = Query(default=None),
    manual_verification_required: Optional[bool] = Query(default=None),
    limit: int                                 = Query(default=50, ge=1, le=500),
    offset: int                                = Query(default=0, ge=0),
):
    try:
        verdict_values = [v.value for v in verdict] if verdict else None
        return admissibility_result_service.get_by_proposal(
            proposal_id=proposal_id,
            verdict=verdict_values,
            role=role,
            domain=domain,
            is_verified=is_verified,
            manual_verification_required=manual_verification_required,
            limit=limit,
            offset=offset,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/by-proposal/{proposal_id}", response_model=DeleteByProposalResponse)
def delete_by_proposal(proposal_id: UUID):
    try:
        return admissibility_result_service.delete_by_proposal(proposal_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch", response_model=BatchInsertResponse)
def batch_insert(items: List[AdmissibilityResultEntryFlatCreate]):
    if not items:
        raise HTTPException(status_code=422, detail="items list must not be empty")
    try:
        return admissibility_result_service.batch_insert(items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{entry_id}", response_model=AdmissibilityResultEntryRead)
def patch_entry(entry_id: UUID, patch: AdmissibilityResultEntryPatch):
    return admissibility_result_service.patch_entry(str(entry_id), patch)
