from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.workflow_phase import WorkflowPhase, WorkflowPhaseFilter
from app.services.workflow_phase_service import workflow_phase_service

router = APIRouter()


@router.post("/search", response_model=List[WorkflowPhase])
def search_workflow_phases(filter_params: WorkflowPhaseFilter):
    try:
        return workflow_phase_service.search_phases(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
