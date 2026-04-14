from app.repositories.original_file_repository import original_file_repository
from app.repositories.processed_file_repository import processed_file_repository
from app.schemas.original_file import OriginalFile, OriginalFileBase, OriginalFileFilter, OriginalFileUpdate
from typing import List, Optional

class OriginalFileService:
    def __init__(self):
        self.repository = original_file_repository

    def get_by_id(self, file_id: str) -> Optional[OriginalFile]:
        data = self.repository.get_by_id(file_id)
        return OriginalFile(**data) if data else None

    def search(self, filter_params: OriginalFileFilter) -> List[OriginalFile]:
        data = self.repository.get_by_analysis_id(filter_params.analysis_id)
        return [OriginalFile(**item) for item in data]

    def create(self, file_data: OriginalFileBase) -> OriginalFile:
        data = self.repository.create(file_data.model_dump(mode="json", exclude_none=True))
        return OriginalFile(**data)

    def update(self, file_id: str, update_data: OriginalFileUpdate) -> Optional[OriginalFile]:
        update_dict = update_data.model_dump(mode="json", exclude_unset=True)

        reorderable_fields = {"proposal_id", "tender_id", "category"}
        if reorderable_fields & update_dict.keys():
            existing = self.repository.get_by_id(file_id)
            if not existing:
                return None
            if not existing.get("is_reorderable", False):
                raise ValueError("Cannot update proposal_id, tender_id or category: file is not reorderable")

        if "proposal_id" in update_dict:
            update_dict.setdefault("tender_id", None)
            update_dict["category"] = "proposal"
        elif "tender_id" in update_dict:
            update_dict.setdefault("proposal_id", None)
            update_dict["category"] = "tender"

        if "category" in update_dict and update_dict.get("category") in (None, "unclassified"):
            update_dict["proposal_id"] = None
            update_dict["tender_id"] = None

        data = self.repository.update_by_id(file_id, update_dict)
        if not data:
            return None

        link_fields = {k: update_dict[k] for k in ("proposal_id", "tender_id", "category") if k in update_dict}
        if link_fields:
            processed_file_repository.update_by_original_file_id(file_id, link_fields)

        return OriginalFile(**data)

original_file_service = OriginalFileService()
