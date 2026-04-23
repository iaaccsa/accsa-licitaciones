from fastapi import APIRouter, HTTPException
from typing import List
from uuid import UUID
from app.schemas.analysis import Analysis, AnalysisUpdate, AnalysisStatusUpdate, AnalysisSource
from app.schemas.job import CancelPipelineResponse, ResumePipelineResponse, RetryJobRequest
from app.schemas.proposal import ProposalRead
from app.services.analysis_service import analysis_service
from app.services.job_orchestrator_service import job_orchestrator_service
from app.services.proposal_service import proposal_service

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

@router.post("/{analysis_id}/resume", response_model=ResumePipelineResponse)
def resume_analysis(analysis_id: UUID):
    """
    Resume a paused pipeline after user approval.
    """
    try:
        launched_jobs = job_orchestrator_service.resume_pipeline(analysis_id)
        return ResumePipelineResponse(
            analysis_id=analysis_id,
            launched_jobs=launched_jobs,
            message=f"Pipeline reanudado. Jobs lanzados: {', '.join(launched_jobs)}",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{analysis_id}/retry-step", response_model=ResumePipelineResponse)
def retry_step(analysis_id: UUID, request: RetryJobRequest):
    try:
        launched_jobs = job_orchestrator_service.retry_job(analysis_id, request.service_name)
        return ResumePipelineResponse(
            analysis_id=analysis_id,
            launched_jobs=launched_jobs,
            message=f"Job relanzado: {request.service_name}. Instancias: {len(launched_jobs)}",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{analysis_id}/proposals", response_model=List[ProposalRead])
def list_proposals_by_analysis(analysis_id: UUID):
    try:
        return proposal_service.get_by_analysis_id(analysis_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{analysis_id}/sources", response_model=List[AnalysisSource])
def get_analysis_sources(analysis_id: UUID):
    try:
        return analysis_service.get_sources(analysis_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{analysis_id}", response_model=Analysis)
def update_analysis(analysis_id: UUID, update_data: AnalysisUpdate):
    """
    Update analysis fields (e.g. generated_name).
    """
    try:
        return analysis_service.update_analysis(analysis_id, update_data)
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
