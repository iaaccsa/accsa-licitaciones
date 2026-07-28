from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.workflow_step import WorkflowStep, WorkflowStepBase, WorkflowStepFilter
from app.services.workflow_step_service import workflow_step_service

router = APIRouter()

@router.post("/search", response_model=List[WorkflowStep])
def search_workflow_steps(filter_params: WorkflowStepFilter):
    """
    Search workflow steps by analysis_id.
    """
    try:
        return workflow_step_service.search_steps(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/", response_model=WorkflowStep)
def upsert_workflow_step(step_data: WorkflowStepBase):
    """
    Upsert a workflow step. Matches on analysis_id + code.
    If a step with the same analysis_id and code exists, it updates it.
    Otherwise, it creates a new one.
    """
    try:
        return workflow_step_service.upsert_step(step_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
