from enum import Enum
from typing import List, Optional

from app.repositories.model_tier_repository import model_tier_repository
from app.schemas.model_tier import ModelTier


class ModelTierService:
    def __init__(self):
        self.repository = model_tier_repository

    def list_active(self) -> List[ModelTier]:
        return [ModelTier(**row) for row in self.repository.get_all_active()]

    def get_tier(self, role) -> Optional[ModelTier]:
        role = role.value if isinstance(role, Enum) else role
        row = self.repository.get_by_role(role)
        return ModelTier(**row) if row else None


model_tier_service = ModelTierService()
