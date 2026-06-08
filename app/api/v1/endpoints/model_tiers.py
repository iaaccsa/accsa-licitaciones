from fastapi import APIRouter, HTTPException
from typing import List

from app.schemas.analysis import PrimaryModel, IntelligenceLevel
from app.schemas.model_tier import ModelTier
from app.services.model_tier_service import model_tier_service

router = APIRouter()


@router.get("/", response_model=List[ModelTier])
def list_model_tiers():
    """
    List all active model tiers (provider x level -> model).
    """
    try:
        return model_tier_service.list_active()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{provider}/{level}", response_model=ModelTier)
def get_model_tier(provider: PrimaryModel, level: IntelligenceLevel):
    """
    Resolve the active model tier for a given provider and intelligence level.
    """
    try:
        tier = model_tier_service.get_tier(provider, level)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not tier:
        raise HTTPException(status_code=404, detail="Model tier not found")
    return tier
