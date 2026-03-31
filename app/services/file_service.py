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
        update_dict = update_data.model_dump(mode="json", exclude_none=True)
        data = self.repository.update_file_by_id(file_id, update_dict)
        if not data:
            return None

        # Propagate proposal_id/tender_id to linked files
        link_fields = {k: v for k, v in update_dict.items() if k in ("proposal_id", "tender_id")}
        if link_fields and data.get("link"):
            self.repository.update_files_by_link(str(data["link"]), link_fields)

        return File(**data)

file_service = FileService()
