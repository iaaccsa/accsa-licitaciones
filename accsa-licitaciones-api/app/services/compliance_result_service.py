from app.repositories.compliance_result_repository import compliance_result_repository
from app.schemas.compliance_result import ComplianceResult, ComplianceResultCreate, ComplianceResultFilter
from typing import List

class ComplianceResultService:
    def __init__(self):
        self.repository = compliance_result_repository

    def search_results(self, filter_params: ComplianceResultFilter) -> List[ComplianceResult]:
        data = self.repository.get_by_proposal_id(
            proposal_id=filter_params.proposal_id,
            limit=filter_params.limit,
            offset=filter_params.offset
        )
        return [ComplianceResult(**item) for item in data]

    def upsert_results(self, items: List[ComplianceResultCreate]) -> List[ComplianceResult]:
        rows = [item.model_dump(mode="json", exclude_none=True) for item in items]
        data = self.repository.upsert_batch(rows)
        return [ComplianceResult(**item) for item in data]

compliance_result_service = ComplianceResultService()
