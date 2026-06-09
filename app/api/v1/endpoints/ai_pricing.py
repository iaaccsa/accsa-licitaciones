from fastapi import APIRouter, HTTPException
from typing import List

from app.schemas.ai_pricing import AiPricing
from app.services.ai_pricing_service import ai_pricing_service

router = APIRouter()


@router.get("/", response_model=List[AiPricing])
def list_ai_pricing():
    """
    List all active AI price entries (provider x model x operation).
    Read-only: the frozen price snapshot used for cost accounting.
    """
    try:
        return ai_pricing_service.list_active()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{provider}/{model}/{operation}", response_model=AiPricing)
def get_ai_pricing(provider: str, model: str, operation: str):
    """
    Resolve the active price entry for a given provider, model and operation.
    """
    try:
        price = ai_pricing_service.get_price(provider, model, operation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not price:
        raise HTTPException(status_code=404, detail="AI price not found")
    return price
