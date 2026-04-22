from fastapi import APIRouter, HTTPException, Query
from typing import List, Literal, Optional
from uuid import UUID

from app.schemas.compliance_matrix import (
    ComplianceEntryRead,
    ComplianceEntryReadWithRequirement,
    ComplianceEntryPatch,
    ComplianceEntryCreate,
    ComplianceEntryFlatCreate,
    ComplianceMatrixBulkCreate,
    BulkReplaceMatrixResponse,
    ComplianceVerdict,
    ComplianceMatrixViewEntry,
)
from app.services.compliance_matrix_service import compliance_matrix_service

router = APIRouter()


@router.post("/bulk", response_model=BulkReplaceMatrixResponse)
def bulk_replace(items: List[ComplianceEntryFlatCreate]):
    if not items:
        raise HTTPException(status_code=422, detail="items list must not be empty")
    analysis_id = items[0].analysis_id
    proposal_id = items[0].proposal_id
    entries = [
        ComplianceEntryCreate(**item.model_dump(exclude={"analysis_id", "proposal_id"}))
        for item in items
    ]
    payload = ComplianceMatrixBulkCreate(
        analysis_id=analysis_id,
        proposal_id=proposal_id,
        entries=entries,
    )
    return compliance_matrix_service.bulk_replace(payload)


@router.get("/by-proposal/{proposal_id}", response_model=List[ComplianceEntryReadWithRequirement])
def get_by_proposal(
    proposal_id: UUID,
    verdict: Optional[List[ComplianceVerdict]] = Query(default=None),
    role: Optional[str] = Query(default=None),
    domain: Optional[str] = Query(default=None),
    is_verified: Optional[bool] = Query(default=None),
    manual_verification_required: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    try:
        verdict_values = [v.value for v in verdict] if verdict else None
        return compliance_matrix_service.get_by_proposal(
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


@router.get("/by-analysis/{analysis_id}", response_model=List[ComplianceEntryReadWithRequirement])
def get_by_analysis(
    analysis_id: UUID,
    proposal_id: Optional[UUID] = Query(default=None),
    verdict: Optional[List[ComplianceVerdict]] = Query(default=None),
    role: Optional[str] = Query(default=None),
    domain: Optional[str] = Query(default=None),
    is_verified: Optional[bool] = Query(default=None),
    manual_verification_required: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    try:
        verdict_values = [v.value for v in verdict] if verdict else None
        return compliance_matrix_service.get_by_analysis(
            analysis_id=analysis_id,
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


@router.get("/view/by-proposal/{proposal_id}", response_model=List[ComplianceMatrixViewEntry])
def get_view_by_proposal(
    proposal_id: UUID,
    verification_method: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    order: Literal["asc", "desc"] = Query(default="asc"),
    limit: int = Query(default=50, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    try:
        return compliance_matrix_service.get_view_by_proposal(
            proposal_id=proposal_id,
            verification_method=verification_method,
            role=role,
            order=order,
            limit=limit,
            offset=offset,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-requirement/{requirement_id}", response_model=List[ComplianceEntryRead])
def get_by_requirement(requirement_id: UUID):
    try:
        return compliance_matrix_service.get_by_requirement(requirement_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{entry_id}", response_model=ComplianceEntryRead)
def patch_entry(entry_id: UUID, patch: ComplianceEntryPatch):
    return compliance_matrix_service.patch_entry(str(entry_id), patch)
