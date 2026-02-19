from app.repositories.analysis_repository import analysis_repository
from app.schemas.analysis import Analysis
from typing import List

class AnalysisService:
    def __init__(self):
        self.repository = analysis_repository

    def get_all_analyses(self) -> List[Analysis]:
        data = self.repository.get_all()
        # Pydantic validation handles the conversion
        return [Analysis(**item) for item in data]

analysis_service = AnalysisService()
