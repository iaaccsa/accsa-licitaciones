import asyncio
import logging
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status

from app.config import get_settings
from app.models import (
    ExecutionState,
    ExecutionStatusResponse,
    HealthResponse,
    StartJobRequest,
    StartJobResponse,
)
from app.runner import Execution, job_runner
from app.security import require_api_key

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    maintenance = asyncio.create_task(job_runner.run_maintenance(), name="maintenance")
    logger.info(
        f"Executor ready: capacity={settings.EXECUTOR_MAX_CONCURRENCY}, "
        f"{settings.EXECUTOR_CPUS} cpu / {settings.EXECUTOR_MEMORY} per container, "
        f"{len(settings.allowed_services)} allowed services"
    )
    yield
    # Containers already running are left alone on shutdown: killing them would
    # cut analyses that are still fine. What is lost on a restart is the queue
    # and the ability to synthesize a failure callback for whatever was running.
    maintenance.cancel()
    try:
        await maintenance
    except asyncio.CancelledError:
        pass


_is_prod = settings.APP_ENV == "production"
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
    lifespan=lifespan,
)


def _to_response(execution: Execution) -> ExecutionStatusResponse:
    return ExecutionStatusResponse(
        execution_id=execution.execution_id,
        execution_name=execution.execution_name,
        service_name=execution.request.service_name,
        state=execution.state,
        exit_code=execution.exit_code,
        queued_at=execution.queued_at,
        started_at=execution.started_at,
        finished_at=execution.finished_at,
    )


def _get_or_404(execution_id: UUID) -> Execution:
    execution = job_runner.get(execution_id)
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown execution: {execution_id}",
        )
    return execution


@app.get("/version", summary="System version")
async def version():
    return {"name": "accsa-licitaciones-executor", "version": settings.VERSION}


@app.get(
    "/health",
    response_model=HealthResponse,
    dependencies=[Depends(require_api_key)],
    summary="Executor health and capacity",
)
async def health():
    docker_status = await job_runner.docker_status()
    return HealthResponse(
        status="ok" if docker_status == "ok" else "degraded",
        version=settings.VERSION,
        docker=docker_status,
        running=job_runner.count(ExecutionState.RUNNING),
        queued=job_runner.count(ExecutionState.QUEUED),
        capacity=settings.EXECUTOR_MAX_CONCURRENCY,
    )


@app.post(
    "/jobs",
    response_model=StartJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
    summary="Queue a service job",
)
async def start_job(request: StartJobRequest):
    if request.service_name not in settings.allowed_services:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service not allowed: {request.service_name}",
        )

    queued = job_runner.count(ExecutionState.QUEUED)
    if queued >= settings.EXECUTOR_MAX_QUEUE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Queue is full ({queued}/{settings.EXECUTOR_MAX_QUEUE})",
        )

    execution = job_runner.submit(request)
    return StartJobResponse(
        execution_id=execution.execution_id,
        execution_name=execution.execution_name,
        state=execution.state,
    )


@app.get(
    "/jobs/{execution_id}",
    response_model=ExecutionStatusResponse,
    dependencies=[Depends(require_api_key)],
    summary="Inspect one execution",
)
async def get_job(execution_id: UUID):
    return _to_response(_get_or_404(execution_id))


@app.delete(
    "/jobs/{execution_id}",
    response_model=ExecutionStatusResponse,
    dependencies=[Depends(require_api_key)],
    summary="Stop a queued or running execution",
)
async def stop_job(execution_id: UUID):
    execution = _get_or_404(execution_id)
    await job_runner.stop(execution)
    return _to_response(execution)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
