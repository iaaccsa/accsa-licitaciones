from fastapi import APIRouter
from app.core.upload_tokens import create_upload_token, TOKEN_TTL_SECONDS

router = APIRouter()


@router.post("/upload-token", tags=["upload-token"], summary="Issue a one-time upload token")
def issue_upload_token():
    """
    Issues a single-use upload token (TTL 300 s) for the browser to upload
    directly to POST /analyses/ without exposing the API key.

    Auth: X-API-Key (called by the Next.js server, not the browser).
    """
    token = create_upload_token()
    return {"upload_token": token, "expires_in": TOKEN_TTL_SECONDS}
