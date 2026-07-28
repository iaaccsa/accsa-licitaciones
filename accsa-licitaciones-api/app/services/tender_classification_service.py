from app.repositories.tender_classification_repository import tender_classification_repository
from app.schemas.tender_classification import TenderClassification, TenderClassificationCreate
from typing import Optional


class TenderClassificationService:
    def __init__(self):
        self.repository = tender_classification_repository

    def upsert(self, data: TenderClassificationCreate) -> TenderClassification:
        result = self.repository.upsert(data.model_dump(mode="json"))
        return TenderClassification(**result)

    def get_by_analysis_id(self, analysis_id: str) -> Optional[TenderClassification]:
        result = self.repository.get_by_analysis_id(analysis_id)
        return TenderClassification(**result) if result else None


tender_classification_service = TenderClassificationService()
