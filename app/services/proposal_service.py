from app.repositories.proposal_repository import proposal_repository
from app.schemas.proposal import Proposal, ProposalBase, ProposalFilter, ProposalUpdate, ProposalScoreUpdate
from typing import List, Optional

class ProposalService:
    def __init__(self):
        self.repository = proposal_repository

    def search_proposals(self, filter_params: ProposalFilter) -> List[Proposal]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [Proposal(**item) for item in data]

    def create_proposal(self, proposal_data: ProposalBase) -> Proposal:
        data = self.repository.create(proposal_data.model_dump(mode="json", exclude_none=True))
        return Proposal(**data)

    def get_proposal_by_id(self, proposal_id: str) -> Optional[Proposal]:
        data = self.repository.get_by_id(proposal_id)
        return Proposal(**data) if data else None

    def update_proposal(self, proposal_id: str, update_data: ProposalUpdate) -> Optional[Proposal]:
        data = self.repository.update_by_id(
            proposal_id,
            update_data.model_dump(mode="json", exclude_none=True)
        )
        return Proposal(**data) if data else None

    def update_score(self, proposal_id: str, score_data: ProposalScoreUpdate) -> Optional[Proposal]:
        updated = self.repository.update_by_id(
            proposal_id,
            score_data.model_dump(mode="json")
        )
        if not updated:
            return None
        data = self.repository.get_by_id(proposal_id)
        return Proposal(**data) if data else None

proposal_service = ProposalService()
