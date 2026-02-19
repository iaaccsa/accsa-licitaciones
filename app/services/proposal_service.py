from app.repositories.proposal_repository import proposal_repository
from app.schemas.proposal import Proposal, ProposalFilter
from typing import List

class ProposalService:
    def __init__(self):
        self.repository = proposal_repository

    def search_proposals(self, filter_params: ProposalFilter) -> List[Proposal]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [Proposal(**item) for item in data]

proposal_service = ProposalService()
