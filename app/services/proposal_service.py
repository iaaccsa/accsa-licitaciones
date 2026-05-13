from fastapi import HTTPException
from app.repositories.proposal_repository import proposal_repository
from app.repositories.original_file_repository import original_file_repository
from app.repositories.processed_file_repository import processed_file_repository
from app.schemas.proposal import (
    ProposalRead, ProposalCreate, ProposalUpdate,
    ProposalMatchingStart, ProposalMatchingResult, ProposalMatchingFailure,
    ProposalSummaryStart, ProposalSummaryResult, ProposalSummaryFailure,
    ProposalMatchingStatus,
    ProposalAdmissibilityStart, ProposalAdmissibilityResult,
    ProposalAdmissibilityFailure, ProposalAdmissibilityOverride,
    ProposalEconomicStart, ProposalEconomicResult, ProposalEconomicFailure,
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

_ADMISSIBILITY_TERMINAL = {"admitida", "rechazada"}
_VALID_MATCHING_FOR_ADMISSIBILITY = {"matrix_ready", "completed", "summary_failed"}


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

    # --- Matching state machine ---

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

    # --- Admissibility state machine ---

    def admissibility_start(self, proposal_id: str, body: ProposalAdmissibilityStart, force: bool = False) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["admissibility_status"] not in ("pending", "failed"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot start admissibility: current status is '{current['admissibility_status']}', allowed from ['pending', 'failed']",
            )
        if not force and current["matching_status"] not in _VALID_MATCHING_FOR_ADMISSIBILITY:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot start admissibility: matching_status is '{current['matching_status']}', must be one of {sorted(_VALID_MATCHING_FOR_ADMISSIBILITY)}. Use ?force=true to bypass.",
            )
        data = self.repository.update_by_id(proposal_id, {
            "admissibility_status":     "evaluating",
            "admissibility_started_at": body.admissibility_started_at.isoformat(),
            "admissibility_error":      None,
        })
        return ProposalRead(**data)

    def admissibility_result(self, proposal_id: str, body: ProposalAdmissibilityResult) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["admissibility_status"] != "evaluating":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot write admissibility result: current status is '{current['admissibility_status']}', must be 'evaluating'",
            )
        if body.admissibility_status not in _ADMISSIBILITY_TERMINAL:
            raise HTTPException(
                status_code=422,
                detail=f"admissibility_status must be 'admitida' or 'rechazada', got '{body.admissibility_status}'",
            )
        data = self.repository.update_by_id(proposal_id, {
            "admissibility_status":        body.admissibility_status,
            "admissibility_completed_at":  body.admissibility_completed_at.isoformat(),
            "admissibility_reasons":       [r.model_dump() for r in body.admissibility_reasons],
            "admissibility_overridden_by": None,
        })
        return ProposalRead(**data)

    def admissibility_failure(self, proposal_id: str, body: ProposalAdmissibilityFailure) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["admissibility_status"] != "evaluating":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot write admissibility failure: current status is '{current['admissibility_status']}', must be 'evaluating'",
            )
        data = self.repository.update_by_id(proposal_id, {
            "admissibility_status":       "failed",
            "admissibility_completed_at": body.admissibility_completed_at.isoformat(),
            "admissibility_error":        body.admissibility_error,
        })
        return ProposalRead(**data)

    def admissibility_override(self, proposal_id: str, body: ProposalAdmissibilityOverride) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["admissibility_status"] not in _ADMISSIBILITY_TERMINAL:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot override admissibility: current status is '{current['admissibility_status']}', allowed from {sorted(_ADMISSIBILITY_TERMINAL)}",
            )
        if body.admissibility_status not in _ADMISSIBILITY_TERMINAL:
            raise HTTPException(
                status_code=422,
                detail=f"admissibility_status must be 'admitida' or 'rechazada', got '{body.admissibility_status}'",
            )
        data = self.repository.update_by_id(proposal_id, {
            "admissibility_status":        body.admissibility_status,
            "admissibility_overridden_by": body.overridden_by,
        })
        return ProposalRead(**data)


    # --- Economic state machine ---

    _VALID_MATCHING_FOR_ECONOMIC = {"matrix_ready", "summarizing", "completed", "summary_failed"}

    def economic_start(self, proposal_id: str, body: ProposalEconomicStart, force: bool = False) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["economic_status"] not in ("pending", "failed"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot start economic extraction: current status is '{current['economic_status']}', allowed from ['pending', 'failed']",
            )
        if not force and current["matching_status"] not in self._VALID_MATCHING_FOR_ECONOMIC:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot start economic extraction: matching_status is '{current['matching_status']}', must be one of {sorted(self._VALID_MATCHING_FOR_ECONOMIC)}. Use ?force=true to bypass.",
            )
        data = self.repository.update_by_id(proposal_id, {
            "economic_status":     "extracting",
            "economic_started_at": body.economic_started_at.isoformat(),
            "economic_error":      None,
        })
        return ProposalRead(**data)

    def economic_result(self, proposal_id: str, body: ProposalEconomicResult) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["economic_status"] != "extracting":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot write economic result: current status is '{current['economic_status']}', must be 'extracting'",
            )
        data = self.repository.update_by_id(proposal_id, {
            "economic_status":        "ready",
            "economic_completed_at":  body.economic_completed_at.isoformat(),
        })
        return ProposalRead(**data)

    def economic_failure(self, proposal_id: str, body: ProposalEconomicFailure) -> ProposalRead:
        current = self._get_or_404(proposal_id)
        if current["economic_status"] != "extracting":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot write economic failure: current status is '{current['economic_status']}', must be 'extracting'",
            )
        data = self.repository.update_by_id(proposal_id, {
            "economic_status":       "failed",
            "economic_completed_at": body.economic_completed_at.isoformat(),
            "economic_error":        body.economic_error,
        })
        return ProposalRead(**data)


    def delete_by_analysis_id(self, analysis_id: str) -> int:
        original_file_repository.null_proposal_id_by_analysis_id(analysis_id)
        processed_file_repository.null_proposal_id_by_analysis_id(analysis_id)
        return self.repository.delete_by_analysis_id(analysis_id)

proposal_service = ProposalService()
