from app.repositories.tender_repository import tender_repository
from app.schemas.tender import Tender, TenderBase, TenderFilter, TenderUpdate
from typing import List, Optional

class TenderService:
    def __init__(self):
        self.repository = tender_repository

    def search_tenders(self, filter_params: TenderFilter) -> List[Tender]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [Tender(**item) for item in data]

    def create_tender(self, tender_data: TenderBase) -> Tender:
        data = self.repository.create(tender_data.model_dump(mode="json", exclude_none=True))
        return Tender(**data)

    def get_tender_by_id(self, tender_id: str) -> Optional[Tender]:
        data = self.repository.get_by_id(tender_id)
        return Tender(**data) if data else None

    def update_tender(self, tender_id: str, update_data: TenderUpdate) -> Optional[Tender]:
        data = self.repository.update_by_id(
            tender_id,
            update_data.model_dump(mode="json", exclude_none=True)
        )
        return Tender(**data) if data else None

tender_service = TenderService()
