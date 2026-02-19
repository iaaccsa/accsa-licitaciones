from app.repositories.file_repository import file_repository
from app.schemas.file import File, FileFilter
from typing import List

class FileService:
    def __init__(self):
        self.repository = file_repository

    def search_files(self, filter_params: FileFilter) -> List[File]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [File(**item) for item in data]

file_service = FileService()
