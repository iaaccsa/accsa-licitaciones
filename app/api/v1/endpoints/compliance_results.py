from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.compliance_result import ComplianceResult, ComplianceResultFilter
from app.services.compliance_result_service import compliance_result_service

router = APIRouter()

@router.post("/search", response_model=List[ComplianceResult])
def search_compliance_results(filter_params: ComplianceResultFilter):
    """
    Search compliance results by proposal_id.
    """
    try:
        return compliance_result_service.search_results(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
