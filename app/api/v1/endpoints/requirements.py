from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from uuid import UUID

from app.schemas.requirement import (
    AnalysisRequirementBulkCreate,
    AnalysisRequirementRead,
    AnalysisRequirementUpdate,
    BulkReplaceResponse,
    BulkVerifyResponse,
)
from app.services.requirement_service import analysis_requirement_service

router = APIRouter()


@router.post("/bulk", response_model=BulkReplaceResponse)
def bulk_replace(payload: AnalysisRequirementBulkCreate):
    try:
        return analysis_requirement_service.bulk_replace(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{analysis_id}", response_model=List[AnalysisRequirementRead])
def list_requirements(
    analysis_id: UUID,
    domain: Optional[str]            = Query(None),
    role: Optional[str]              = Query(None),
    factor_id: Optional[str]         = Query(None),
    is_admissibility: Optional[bool] = Query(None),
    is_verified: Optional[bool]      = Query(None),
    limit: int                       = Query(50, ge=1, le=500),
    offset: int                      = Query(0, ge=0),
):
    try:
        return analysis_requirement_service.get_by_analysis_id(
            analysis_id=analysis_id,
            domain=domain,
            role=role,
            factor_id=factor_id,
            is_admissibility=is_admissibility,
            is_verified=is_verified,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{analysis_id}/verify-all", response_model=BulkVerifyResponse)
def bulk_set_verified(analysis_id: UUID, is_verified: bool = Query(...)):
    try:
        return analysis_requirement_service.set_verified_bulk(analysis_id, is_verified)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{requirement_id}", response_model=AnalysisRequirementRead)
def update_requirement(requirement_id: UUID, patch: AnalysisRequirementUpdate):
    try:
        result = analysis_requirement_service.update(str(requirement_id), patch)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return result
