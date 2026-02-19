from app.repositories.base_repository import BaseRepository

class AnalysisRepository(BaseRepository):
    def __init__(self):
        super().__init__("analyses")

analysis_repository = AnalysisRepository()
