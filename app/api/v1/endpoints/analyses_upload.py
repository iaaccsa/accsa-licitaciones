"""
Public router for POST /analyses/ — accepts either X-API-Key or X-Upload-Token.
Mounted directly in main.py (outside the api_router that enforces X-API-Key globally)
so that browser clients using a one-time upload token can reach this endpoint.
"""
from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File, status
from app.core.config import get_settings
from app.core.upload_tokens import consume_upload_token
from app.schemas.analysis import Analysis
from app.services.analysis_service import analysis_service

router = APIRouter()


def _verify_auth(request: Request):
    """Accept X-API-Key (server-to-server) or X-Upload-Token (browser direct upload)."""
    api_key = request.headers.get("X-API-Key")
    if api_key:
        settings = get_settings()
        if api_key != settings.BACKEND_API_KEY:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Could not validate credentials")
        return

    upload_token = request.headers.get("X-Upload-Token")
    if upload_token and consume_upload_token(upload_token):
        return

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


@router.post("/analyses/", response_model=Analysis, tags=["analyses"], summary="Create analysis (upload ZIP)")
async def create_analysis(
    request: Request,
    file: UploadFile = File(...),
    user_name: str | None = Form(None),
):
    """
    Create a new analysis by uploading a ZIP file.

    Auth (one of):
    - `X-API-Key` — standard server-to-server auth
    - `X-Upload-Token` — single-use token issued by POST /upload-token (for browser direct upload)
    """
    _verify_auth(request)

    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")

    try:
        return await analysis_service.create_analysis(file, user_name=user_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
