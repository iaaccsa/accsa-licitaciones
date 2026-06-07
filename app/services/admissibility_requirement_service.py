from app.repositories.admissibility_requirement_repository import admissibility_requirement_repository
from app.schemas.admissibility_requirement import (
    AdmissibilityRequirementCreate,
    AdmissibilityRequirementRead,
    AdmissibilityRequirementUpdate,
    BulkReplaceResponse,
    BulkVerifyResponse,
)
from typing import List, Optional
from uuid import UUID


class AdmissibilityRequirementService:
    def __init__(self):
        self.repository = admissibility_requirement_repository

    def bulk_replace(self, analysis_id: UUID, requirements: List[AdmissibilityRequirementCreate]) -> BulkReplaceResponse:
        analysis_id_str = str(analysis_id)
        deleted = self.repository.delete_by_analysis_id(analysis_id_str)
        rows = [
            {"analysis_id": analysis_id_str, **req.model_dump(mode="json")}
            for req in requirements
        ]
        inserted_data = self.repository.insert_batch(rows) if rows else []
        return BulkReplaceResponse(
            analysis_id=analysis_id,
            inserted=len(inserted_data),
            deleted=deleted,
        )

    def get_by_analysis_id(
        self,
        analysis_id: UUID,
        domain: Optional[str] = None,
        role: Optional[str] = None,
        is_verified: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AdmissibilityRequirementRead]:
        data = self.repository.get_by_analysis_id(
            analysis_id=str(analysis_id),
            domain=domain,
            role=role,
            is_verified=is_verified,
            limit=limit,
            offset=offset,
        )
        return [AdmissibilityRequirementRead(**item) for item in data]

    def set_verified_bulk(self, analysis_id: UUID, is_verified: bool) -> BulkVerifyResponse:
        updated = self.repository.set_verified_by_analysis_id(str(analysis_id), is_verified)
        return BulkVerifyResponse(analysis_id=analysis_id, updated=updated)

    def update(self, requirement_id: str, patch: AdmissibilityRequirementUpdate) -> Optional[AdmissibilityRequirementRead]:
        data = patch.model_dump(mode="json", exclude_none=True)
        if not data:
            result = self.repository.get_by_id(requirement_id)
        else:
            result = self.repository.update_by_id(requirement_id, data)
        return AdmissibilityRequirementRead(**result) if result else None


admissibility_requirement_service = AdmissibilityRequirementService()
