from app.repositories.ai_usage_repository import ai_usage_repository
from app.schemas.ai_usage import AiUsage, AiUsageCreate


class AiUsageService:
    def __init__(self):
        self.repository = ai_usage_repository

    def create(self, usage: AiUsageCreate) -> AiUsage:
        data = self.repository.create(usage.model_dump(mode="json"))
        return AiUsage(**data)


ai_usage_service = AiUsageService()
