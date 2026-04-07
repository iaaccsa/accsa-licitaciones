from app.repositories.requirement_repository import analysis_requirement_repository
from app.schemas.requirement import (
    AnalysisRequirementBulkCreate,
    AnalysisRequirementCreate,
    AnalysisRequirementRead,
    AnalysisRequirementUpdate,
    BulkReplaceResponse,
)
from typing import List, Optional
from uuid import UUID


class AnalysisRequirementService:
    def __init__(self):
        self.repository = analysis_requirement_repository

    def bulk_replace(self, payload: AnalysisRequirementBulkCreate) -> BulkReplaceResponse:
        analysis_id = str(payload.analysis_id)
        deleted = self.repository.delete_by_analysis_id(analysis_id)
        rows = [
            {"analysis_id": analysis_id, **req.model_dump(mode="json")}
            for req in payload.requirements
        ]
        inserted_data = self.repository.insert_batch(rows) if rows else []
        return BulkReplaceResponse(
            analysis_id=payload.analysis_id,
            inserted=len(inserted_data),
            deleted=deleted,
        )

    def get_by_analysis_id(
        self,
        analysis_id: UUID,
        domain: Optional[str] = None,
        role: Optional[str] = None,
        factor_id: Optional[str] = None,
        is_verified: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AnalysisRequirementRead]:
        data = self.repository.get_by_analysis_id(
            analysis_id=str(analysis_id),
            domain=domain,
            role=role,
            factor_id=factor_id,
            is_verified=is_verified,
            limit=limit,
            offset=offset,
        )
        return [AnalysisRequirementRead(**item) for item in data]

    def update(self, requirement_id: str, patch: AnalysisRequirementUpdate) -> Optional[AnalysisRequirementRead]:
        data = patch.model_dump(mode="json", exclude_none=True)
        if not data:
            result = self.repository.get_by_id(requirement_id)
        else:
            result = self.repository.update_by_id(requirement_id, data)
        return AnalysisRequirementRead(**result) if result else None


analysis_requirement_service = AnalysisRequirementService()
