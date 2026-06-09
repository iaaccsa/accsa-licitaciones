from app.repositories.base_repository import BaseRepository


class AiUsageRepository(BaseRepository):
    def __init__(self):
        super().__init__("ai_usage")


ai_usage_repository = AiUsageRepository()
