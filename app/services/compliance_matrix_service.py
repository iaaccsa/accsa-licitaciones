from fastapi import HTTPException
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from app.repositories.compliance_matrix_repository import compliance_matrix_repository
from app.schemas.compliance_matrix import (
    ComplianceEntryRead,
    ComplianceEntryReadWithRequirement,
    ComplianceEntryCreate,
    ComplianceMatrixBulkCreate,
    ComplianceEntryPatch,
    BulkReplaceMatrixResponse,
    RequirementEmbedded,
)


def _to_entry_read(row: dict) -> ComplianceEntryRead:
    return ComplianceEntryRead(**row)


def _to_entry_with_req(row: dict) -> ComplianceEntryReadWithRequirement:
    req_data = row.pop("analysis_requirements", None)
    entry = ComplianceEntryReadWithRequirement(
        **row,
        requirement=RequirementEmbedded(**req_data) if req_data else None,
    )
    return entry


class ComplianceMatrixService:
    def __init__(self):
        self.repository = compliance_matrix_repository

    def bulk_replace(self, payload: ComplianceMatrixBulkCreate) -> BulkReplaceMatrixResponse:
        # Validate requirement_ids
        req_ids = {str(e.requirement_id) for e in payload.entries}
        missing = self.repository.validate_requirement_ids(payload.analysis_id, req_ids)
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown requirement_ids for this analysis: {sorted(missing)}",
            )

        rows = [
            {
                "analysis_id": str(payload.analysis_id),
                "proposal_id": str(payload.proposal_id),
                **e.model_dump(mode="json"),
            }
            for e in payload.entries
        ]
        inserted, deleted = self.repository.bulk_replace(
            payload.analysis_id, payload.proposal_id, rows
        )
        return BulkReplaceMatrixResponse(
            analysis_id=payload.analysis_id,
            proposal_id=payload.proposal_id,
            inserted=inserted,
            deleted=deleted,
        )

    def get_by_proposal(
        self,
        proposal_id: UUID,
        verdict: Optional[List[str]] = None,
        role: Optional[str] = None,
        domain: Optional[str] = None,
        is_verified: Optional[bool] = None,
        manual_verification_required: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ComplianceEntryReadWithRequirement]:
        rows = self.repository.get_by_proposal(proposal_id)

        # Python-side filtering
        if verdict:
            rows = [r for r in rows if r.get("verdict") in verdict]
        if is_verified is not None:
            rows = [r for r in rows if r.get("is_verified") == is_verified]
        if manual_verification_required is not None:
            rows = [r for r in rows if r.get("manual_verification_required") == manual_verification_required]
        if domain:
            rows = [r for r in rows if (r.get("analysis_requirements") or {}).get("domain") == domain]
        if role:
            rows = [r for r in rows if role in ((r.get("analysis_requirements") or {}).get("roles") or [])]

        rows = rows[offset: offset + limit]
        return [_to_entry_with_req(dict(r)) for r in rows]

    def get_by_analysis(
        self,
        analysis_id: UUID,
        proposal_id: Optional[UUID] = None,
        verdict: Optional[List[str]] = None,
        role: Optional[str] = None,
        domain: Optional[str] = None,
        is_verified: Optional[bool] = None,
        manual_verification_required: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ComplianceEntryReadWithRequirement]:
        rows = self.repository.get_by_analysis(analysis_id, proposal_id)

        if verdict:
            rows = [r for r in rows if r.get("verdict") in verdict]
        if is_verified is not None:
            rows = [r for r in rows if r.get("is_verified") == is_verified]
        if manual_verification_required is not None:
            rows = [r for r in rows if r.get("manual_verification_required") == manual_verification_required]
        if domain:
            rows = [r for r in rows if (r.get("analysis_requirements") or {}).get("domain") == domain]
        if role:
            rows = [r for r in rows if role in ((r.get("analysis_requirements") or {}).get("roles") or [])]

        rows = rows[offset: offset + limit]
        return [_to_entry_with_req(dict(r)) for r in rows]

    def get_by_requirement(self, requirement_id: UUID) -> List[ComplianceEntryRead]:
        rows = self.repository.get_by_requirement(requirement_id)
        return [_to_entry_read(r) for r in rows]

    def patch_entry(self, entry_id: str, patch: ComplianceEntryPatch) -> ComplianceEntryRead:
        existing = self.repository.get_by_id(entry_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Entry not found")

        data = patch.model_dump(mode="json", exclude_none=True)
        if patch.is_verified is True and "reviewed_at" not in data:
            data["reviewed_at"] = datetime.now(timezone.utc).isoformat()

        updated = self.repository.update_patch(entry_id, data)
        return _to_entry_read(updated)


compliance_matrix_service = ComplianceMatrixService()
