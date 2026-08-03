from fastapi import APIRouter, HTTPException
from typing import List

from app.schemas.analysis import ModelTierRole
from app.schemas.model_tier import ModelTier
from app.services.model_tier_service import model_tier_service

router = APIRouter()


@router.get("/", response_model=List[ModelTier])
def list_model_tiers():
    """
    List the active models: one primary and one secondary.
    """
    try:
        return model_tier_service.list_active()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{role}", response_model=ModelTier)
def get_model_tier(role: ModelTierRole):
    """
    Resolve the active model for a role: primary or secondary.
    """
    try:
        tier = model_tier_service.get_tier(role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not tier:
        raise HTTPException(status_code=404, detail="Model tier not found")
    return tier
