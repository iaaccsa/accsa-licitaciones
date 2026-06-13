from fastapi import APIRouter, HTTPException, Depends
from typing import List
from uuid import UUID
from app.core.audit import Actor, get_actor
from app.services.audit_service import audit_service
from app.schemas.analysis import Analysis, AnalysisUpdate, AnalysisStatusUpdate, AnalysisSource
from app.schemas.job import CancelPipelineResponse, ResumePipelineResponse, RetryJobRequest
from app.schemas.proposal import ProposalRead
from app.schemas.model_tier import AnalysisModelConfig
from app.schemas.ai_usage import AiUsageCostSummary
from app.services.analysis_service import analysis_service
from app.services.ai_usage_service import ai_usage_service
from app.services.job_orchestrator_service import job_orchestrator_service
from app.services.proposal_service import proposal_service
from app.services.model_tier_service import model_tier_service

router = APIRouter()

@router.get("/", response_model=List[Analysis])
def read_analyses(created_by: UUID | None = None):
    """
    Retrieve all analyses, optionally filtered by creator.
    """
    try:
        return analysis_service.get_all_analyses(str(created_by) if created_by else None)
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
def get_analysis_sources(analysis_id: UUID, actor: Actor = Depends(get_actor)):
    try:
        sources = analysis_service.get_sources(analysis_id)
        audit_service.log(
            "analysis.download", actor,
            analysis_id=str(analysis_id), resource_type="analysis", resource_id=str(analysis_id),
            details={"count": len(sources)},
        )
        return sources
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{analysis_id}/cost", response_model=AiUsageCostSummary)
def get_analysis_cost(analysis_id: UUID):
    try:
        return ai_usage_service.cost_summary(analysis_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{analysis_id}/model-config", response_model=AnalysisModelConfig)
def get_analysis_model_config(analysis_id: UUID):
    """
    Resolve which LLM model an analysis should use, from its selected
    primary_model + intelligence_level via the model_tiers table.
    """
    try:
        analysis = analysis_service.get_analysis_by_id(analysis_id)
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        tier = model_tier_service.get_tier(analysis.primary_model, analysis.intelligence_level)
        if not tier:
            raise HTTPException(status_code=404, detail="No active model tier for selection")
        return AnalysisModelConfig(
            analysis_id=analysis.id,
            provider=tier.provider,
            level=tier.level,
            model_id=tier.model_id,
            fallback_model_id=tier.fallback_model_id,
        )
    except HTTPException:
        raise
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
