from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from uuid import UUID

from app.schemas.compliance_matrix import (
    ComplianceEntryRead,
    ComplianceEntryReadWithRequirement,
    ComplianceEntryPatch,
    ComplianceMatrixBulkCreate,
    BulkReplaceMatrixResponse,
    ComplianceVerdict,
)
from app.services.compliance_matrix_service import compliance_matrix_service

router = APIRouter()


@router.post("/bulk", response_model=BulkReplaceMatrixResponse)
def bulk_replace(payload: ComplianceMatrixBulkCreate):
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


@router.get("/by-requirement/{requirement_id}", response_model=List[ComplianceEntryRead])
def get_by_requirement(requirement_id: UUID):
    try:
        return compliance_matrix_service.get_by_requirement(requirement_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{entry_id}", response_model=ComplianceEntryRead)
def patch_entry(entry_id: UUID, patch: ComplianceEntryPatch):
    return compliance_matrix_service.patch_entry(str(entry_id), patch)
