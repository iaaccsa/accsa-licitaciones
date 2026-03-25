from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from typing import List
from uuid import UUID
from app.schemas.analysis import Analysis, AnalysisStatusUpdate
from app.schemas.job import CancelPipelineResponse
from app.services.analysis_service import analysis_service
from app.services.job_orchestrator_service import job_orchestrator_service

router = APIRouter()

@router.get("/", response_model=List[Analysis])
def read_analyses():
    """
    Retrieve all analyses.
    """
    try:
        return analysis_service.get_all_analyses()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{analysis_id}", response_model=Analysis)
def get_analysis(analysis_id: UUID):
    """
    Get an analysis by ID.
    """
    try:
        analysis = analysis_service.get_analysis_by_id(analysis_id)
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=Analysis)
async def create_analysis(file: UploadFile = File(...), user_name: str | None = Form(None)):
    """
    Create a new analysis by uploading a ZIP file.
    """
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")

    try:
        return await analysis_service.create_analysis(file, user_name=user_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{analysis_id}/cancel", response_model=CancelPipelineResponse)
def cancel_analysis(analysis_id: UUID):
    """
    Cancel an analysis and stop all running Azure jobs.
    """
    try:
        cancelled_count = job_orchestrator_service.cancel_pipeline(analysis_id)
        return CancelPipelineResponse(
            analysis_id=analysis_id,
            cancelled_jobs=cancelled_count,
            message=f"Análisis cancelado. {cancelled_count} jobs detenidos.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{analysis_id}/status", response_model=Analysis)
def update_analysis_status(analysis_id: UUID, status_update: AnalysisStatusUpdate):
    """
    Update the status of an analysis.
    """
    try:
        return analysis_service.update_analysis_status(analysis_id, status_update)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
