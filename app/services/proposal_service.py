from fastapi import HTTPException
from app.repositories.proposal_repository import proposal_repository
from app.schemas.proposal import (
    ProposalRead, ProposalCreate, ProposalUpdate,
    ProposalMatchingStart, ProposalMatchingResult, ProposalMatchingFailure,
    ProposalSummaryStart, ProposalSummaryResult, ProposalSummaryFailure,
    ProposalMatchingStatus,
)
from typing import List, Optional


VALID_TRANSITIONS = {
    "matching-start":    ([ProposalMatchingStatus.pending, ProposalMatchingStatus.failed],         ProposalMatchingStatus.matching),
    "matching-result":   ([ProposalMatchingStatus.matching],                                        ProposalMatchingStatus.matrix_ready),
    "matching-failure":  ([ProposalMatchingStatus.matching],                                        ProposalMatchingStatus.failed),
    "summary-start":     ([ProposalMatchingStatus.matrix_ready, ProposalMatchingStatus.summary_failed], ProposalMatchingStatus.summarizing),
    "summary-result":    ([ProposalMatchingStatus.summarizing],                                     ProposalMatchingStatus.completed),
    "summary-failure":   ([ProposalMatchingStatus.summarizing],                                     ProposalMatchingStatus.summary_failed),
}


def _assert_transition(current: str, transition: str):
    allowed_from, to = VALID_TRANSITIONS[transition]
    allowed_values = [s.value for s in allowed_from]
    if current not in allowed_values:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid transition '{transition}': current status is '{current}', allowed from {allowed_values}",
        )
    return to.value


class ProposalService:
    def __init__(self):
        self.repository = proposal_repository

    def _get_or_404(self, proposal_id: str) -> dict:
        data = self.repository.get_by_id(proposal_id)
        if not data:
            raise HTTPException(status_code=404, detail="Proposal not found")
        return data

    def get_by_analysis_id(self, analysis_id) -> List[ProposalRead]:
        data = self.repository.get_by_analysis_id(analysis_id=analysis_id)
        return [ProposalRead(**row) for row in data]

    def create_proposal(self, proposal_data: ProposalCreate) -> ProposalRead:
        data = self.repository.create(proposal_data.model_dump(mode="json"))
        return ProposalRead(**data)

    def get_proposal_by_id(self, proposal_id: str) -> ProposalRead:
        data = self._get_or_404(proposal_id)
        return ProposalRead(**data)

    def update_proposal(self, proposal_id: str, update_data: ProposalUpdate) -> ProposalRead:
        self._get_or_404(proposal_id)
        data = self.repository.update_by_id(
            proposal_id,
            update_data.model_dump(mode="json", exclude_none=True),
        )
        return ProposalRead(**data)

    # --- Máquina de estados ---

    def matching_start(self, proposal_id: str, body: ProposalMatchingStart) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        _assert_transition(current["matching_status"], "matching-start")
        data = self.repository.update_by_id(proposal_id, {
            "matching_status":    "matching",
            "matching_started_at": body.matching_started_at.isoformat(),
            "matching_error":     None,
        })
        return ProposalRead(**data)

    def matching_result(self, proposal_id: str, body: ProposalMatchingResult) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        _assert_transition(current["matching_status"], "matching-result")
        data = self.repository.update_by_id(proposal_id, {
            "matching_status":       "matrix_ready",
            "matching_completed_at": body.matching_completed_at.isoformat(),
        })
        return ProposalRead(**data)

    def matching_failure(self, proposal_id: str, body: ProposalMatchingFailure) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        _assert_transition(current["matching_status"], "matching-failure")
        data = self.repository.update_by_id(proposal_id, {
            "matching_status":       "failed",
            "matching_completed_at": body.matching_completed_at.isoformat(),
            "matching_error":        body.matching_error,
        })
        return ProposalRead(**data)

    def summary_start(self, proposal_id: str, body: ProposalSummaryStart) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        _assert_transition(current["matching_status"], "summary-start")
        data = self.repository.update_by_id(proposal_id, {
            "matching_status":      "summarizing",
            "summarizing_started_at": body.summarizing_started_at.isoformat(),
            "summary_error":        None,
        })
        return ProposalRead(**data)

    def summary_result(self, proposal_id: str, body: ProposalSummaryResult) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        _assert_transition(current["matching_status"], "summary-result")
        data = self.repository.update_by_id(proposal_id, {
            "matching_status":           "completed",
            "summarizing_completed_at":  body.summarizing_completed_at.isoformat(),
            "compliance_rate":           float(body.compliance_rate),
            "compliance_counts":         body.compliance_counts,
            "compliance_summary":        body.compliance_summary,
            "critical_failures_count":   body.critical_failures_count,
        })
        return ProposalRead(**data)

    def summary_failure(self, proposal_id: str, body: ProposalSummaryFailure) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        _assert_transition(current["matching_status"], "summary-failure")
        data = self.repository.update_by_id(proposal_id, {
            "matching_status":          "summary_failed",
            "summarizing_completed_at": body.summarizing_completed_at.isoformat(),
            "summary_error":            body.summary_error,
        })
        return ProposalRead(**data)


proposal_service = ProposalService()
