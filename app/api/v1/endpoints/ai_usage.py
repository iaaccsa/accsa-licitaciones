from fastapi import APIRouter, HTTPException

from app.schemas.ai_usage import AiUsage, AiUsageCreate
from app.services.ai_usage_service import ai_usage_service

router = APIRouter()


@router.post("/", response_model=AiUsage, status_code=201)
def create_ai_usage(usage: AiUsageCreate):
    """
    Record one AI usage row (one LLM/embedding/OCR call). Append-only.
    Cost is computed in the caller and frozen here.
    """
    try:
        return ai_usage_service.create(usage)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
