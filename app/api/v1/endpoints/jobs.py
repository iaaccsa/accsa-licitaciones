import logging
from fastapi import APIRouter, HTTPException, status

from app.schemas.job import (
    StartPipelineRequest,
    StartPipelineResponse,
    JobCallbackRequest,
    JobCallbackResponse,
)
from app.services.job_orchestrator_service import job_orchestrator_service
from app.repositories.analysis_repository import analysis_repository

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/start",
    response_model=StartPipelineResponse,
    summary="Iniciar pipeline de jobs",
)
async def start_pipeline(request: StartPipelineRequest):
    """
    Inicia el pipeline de procesamiento lanzando el primer job
    de la cadena de dependencias para el analysis_id dado.
    """
    try:
        started_job = job_orchestrator_service.start_pipeline(
            analysis_id=request.analysis_id,
            proposal_id=request.proposal_id,
        )
        return StartPipelineResponse(
            analysis_id=request.analysis_id,
            started_job=started_job,
            message=f"Pipeline iniciado. Primer job lanzado: {started_job}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error starting pipeline: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al iniciar el pipeline: {str(e)}",
        )


@router.post(
    "/callback",
    response_model=JobCallbackResponse,
    summary="Callback de finalización de job",
)
async def job_callback(request: JobCallbackRequest):
    """
    Recibe la notificación de que un job terminó (éxito o fallo).
    Si fue exitoso, lanza automáticamente los siguientes jobs en la cadena.
    """
    try:
        next_jobs = job_orchestrator_service.on_job_completed(
            service_name=request.service_name,
            analysis_id=request.analysis_id,
            proposal_id=request.proposal_id,
            file_id=request.file_id,
            original_file_id=request.original_file_id,
            status=request.status,
            error_message=request.error_message,
        )

        if request.status == "failed":
            message = f"Job {request.service_name} falló. Pipeline detenido."
        elif next_jobs:
            message = f"Job {request.service_name} completado. Siguientes jobs lanzados: {', '.join(next_jobs)}"
        else:
            analysis = analysis_repository.get_by_id(str(request.analysis_id))
            if analysis and analysis.get("status") == "awaiting_approval":
                message = f"Job {request.service_name} completado. Pipeline pausado, esperando aprobación."
            else:
                message = f"Job {request.service_name} completado. Pipeline finalizado."

        return JobCallbackResponse(
            received=True,
            next_jobs_started=next_jobs,
            message=message,
        )
    except Exception as e:
        logger.error(f"Error processing job callback: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar callback: {str(e)}",
        )
