"""
Public router for POST /analyses/ — accepts either X-API-Key or X-Upload-Token.
Mounted directly in main.py (outside the api_router that enforces X-API-Key globally)
so that browser clients can reach this endpoint without exposing the API key.

The browser uploads the ZIP directly to Supabase Storage and then calls this endpoint
with the resulting storage_path.
"""
from fastapi import APIRouter, HTTPException, Request, status
from app.core.config import get_settings
from app.core.upload_tokens import consume_upload_token
from app.schemas.analysis import Analysis, AnalysisFromStoragePath
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


@router.post("/analyses/", response_model=Analysis, tags=["analyses"], summary="Create analysis from storage path")
async def create_analysis(
    request: Request,
    body: AnalysisFromStoragePath,
):
    """
    Create a new analysis. The ZIP file must already be uploaded to Supabase Storage.
    Provide the resulting `storage_path` (e.g. `"{uuid}.zip"`) in the request body.

    Auth (one of):
    - `X-API-Key` — standard server-to-server auth
    - `X-Upload-Token` — single-use token issued by POST /upload-token (for browser direct upload)
    """
    _verify_auth(request)

    try:
        return await analysis_service.create_analysis_from_storage(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
