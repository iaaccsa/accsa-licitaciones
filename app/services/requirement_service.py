from app.repositories.requirement_repository import requirement_repository
from app.schemas.requirement import Requirement, RequirementBase, RequirementFilter
from typing import List

class RequirementService:
    def __init__(self):
        self.repository = requirement_repository

    def search_requirements(self, filter_params: RequirementFilter) -> List[Requirement]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id,
            limit=filter_params.limit,
            offset=filter_params.offset
        )
        return [Requirement(**item) for item in data]

    def create_bulk_requirements(self, items: List[RequirementBase]) -> List[Requirement]:
        rows = [item.model_dump(mode="json", exclude_none=True) for item in items]
        data = self.repository.upsert_batch(rows)
        return [Requirement(**item) for item in data]

requirement_service = RequirementService()
