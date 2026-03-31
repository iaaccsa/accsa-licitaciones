from app.repositories.file_repository import file_repository
from app.schemas.file import File, FileBase, FileFilter, FileUpdate
from typing import List, Optional

class FileService:
    def __init__(self):
        self.repository = file_repository

    def get_file_by_id(self, file_id: str) -> Optional[File]:
        data = self.repository.get_by_id(file_id)
        return File(**data) if data else None

    def search_files(self, filter_params: FileFilter) -> List[File]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [File(**item) for item in data]

    def get_merged_files(self, filter_params: FileFilter) -> List[File]:
        data = self.repository.get_merged_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [File(**item) for item in data]

    def create_file(self, file_data: FileBase) -> File:
        data = self.repository.create_file(file_data.model_dump(mode="json", exclude_none=True))
        return File(**data)

    def update_file(self, file_id: str, update_data: FileUpdate) -> Optional[File]:
        update_dict = update_data.model_dump(mode="json", exclude_unset=True)

        # Validate is_reorderable before allowing classification changes
        reorderable_fields = {"proposal_id", "tender_id", "category"}
        if reorderable_fields & update_dict.keys():
            existing = self.repository.get_by_id(file_id)
            if not existing:
                return None
            if not existing.get("is_reorderable", False):
                raise ValueError("Cannot update proposal_id, tender_id or category: file is not reorderable")

        # If setting proposal_id or tender_id, clear both first then set the one received
        # Also update category accordingly
        if "proposal_id" in update_dict:
            update_dict.setdefault("tender_id", None)
            update_dict["category"] = "proposal"
        elif "tender_id" in update_dict:
            update_dict.setdefault("proposal_id", None)
            update_dict["category"] = "tender"

        # If category is set to unclassified or null, clear proposal_id and tender_id
        if "category" in update_dict and update_dict.get("category") in (None, "unclassified"):
            update_dict["proposal_id"] = None
            update_dict["tender_id"] = None

        data = self.repository.update_file_by_id(file_id, update_dict)
        if not data:
            return None

        # Propagate proposal_id/tender_id/category to files that link to this file
        link_fields = {k: update_dict[k] for k in ("proposal_id", "tender_id", "category") if k in update_dict}
        if link_fields:
            self.repository.update_files_by_link(file_id, link_fields)

        return File(**data)

file_service = FileService()
