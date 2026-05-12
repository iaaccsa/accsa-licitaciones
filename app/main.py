import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.v1.router import api_router
from app.api.v1.endpoints.analyses_upload import router as analyses_upload_router
from app.services.job_monitor_service import job_monitor_service

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    monitor_task = None
    if settings.APP_ENV != "production":
        monitor_task = asyncio.create_task(job_monitor_service.run_forever(), name="job_monitor")
    yield
    if monitor_task:
        job_monitor_service.stop()
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass
        logger.info("[Lifespan] Job monitor detenido.")


_is_prod = settings.APP_ENV == "production"
app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the analyses upload router first (handles POST /analyses/ with X-API-Key or X-Upload-Token)
app.include_router(analyses_upload_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/", summary="Root endpoint")
async def root():
    """
    Root endpoint that returns a welcome message.
    """
    return {"message": "Hola desde el API del Asistente de Licitaciones!"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import Response
    return Response(content=b"", media_type="image/x-icon")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
