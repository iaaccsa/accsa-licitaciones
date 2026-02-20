from app.repositories.file_repository import file_repository
from app.schemas.file import File, FileBase, FileFilter
from typing import List

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

file_service = FileService()
