from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.compliance_result import ComplianceResult, ComplianceResultCreate, ComplianceResultFilter
from app.services.compliance_result_service import compliance_result_service

router = APIRouter()

@router.put("/", response_model=List[ComplianceResult])
def upsert_compliance_results(items: List[ComplianceResultCreate]):
    try:
        return compliance_result_service.upsert_results(items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=List[ComplianceResult])
def search_compliance_results(filter_params: ComplianceResultFilter):
    """
    Search compliance results by proposal_id.
    """
    try:
        return compliance_result_service.search_results(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
