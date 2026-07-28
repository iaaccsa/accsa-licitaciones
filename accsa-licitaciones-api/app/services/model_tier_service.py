from enum import Enum
from typing import List, Optional

from app.repositories.model_tier_repository import model_tier_repository
from app.schemas.model_tier import ModelTier


class ModelTierService:
    def __init__(self):
        self.repository = model_tier_repository

    def list_active(self) -> List[ModelTier]:
        return [ModelTier(**row) for row in self.repository.get_all_active()]

    def get_tier(self, provider, level) -> Optional[ModelTier]:
        provider = provider.value if isinstance(provider, Enum) else provider
        level = level.value if isinstance(level, Enum) else level
        row = self.repository.get_by_provider_level(provider, level)
        return ModelTier(**row) if row else None


model_tier_service = ModelTierService()
