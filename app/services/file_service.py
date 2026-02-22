from app.repositories.file_repository import file_repository
from app.schemas.file import File, FileBase, FileFilter, FileUpdate
from typing import List, Optional

class FileService:
    def __init__(self):
        self.repository = file_repository

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
        data = self.repository.update_file_by_id(
            file_id,
            update_data.model_dump(mode="json", exclude_none=True)
        )
        return File(**data) if data else None

file_service = FileService()
