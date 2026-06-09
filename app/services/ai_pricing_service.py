from typing import List, Optional

from app.repositories.ai_pricing_repository import ai_pricing_repository
from app.schemas.ai_pricing import AiPricing


class AiPricingService:
    def __init__(self):
        self.repository = ai_pricing_repository

    def list_active(self) -> List[AiPricing]:
        return [AiPricing(**row) for row in self.repository.get_all_active()]

    def get_price(self, provider: str, model: str, operation: str) -> Optional[AiPricing]:
        row = self.repository.get_by_provider_model_operation(provider, model, operation)
        return AiPricing(**row) if row else None


ai_pricing_service = AiPricingService()
