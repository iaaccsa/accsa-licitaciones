from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.schemas.compliance_result import ComplianceResult, ComplianceResultCreate, ComplianceResultFilter
from app.services.compliance_result_service import compliance_result_service
from app.core.audit import Actor, get_actor
from app.services.audit_service import audit_service

router = APIRouter()

@router.put("/", response_model=List[ComplianceResult])
def upsert_compliance_results(items: List[ComplianceResultCreate], actor: Actor = Depends(get_actor)):
    try:
        result = compliance_result_service.upsert_results(items)
        if actor.user_id:  # skip pipeline writes (service-compliance-matcher), only audit user edits
            analysis_id = next((str(r.analysis_id) for r in result if r.analysis_id), None)
            audit_service.log(
                "compliance_result.update", actor,
                analysis_id=analysis_id, resource_type="compliance_result",
                details={"count": len(items), "proposal_ids": list({str(i.proposal_id) for i in items})},
            )
        return result
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
