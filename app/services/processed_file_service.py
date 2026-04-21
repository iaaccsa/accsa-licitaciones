from app.repositories.processed_file_repository import processed_file_repository
from app.schemas.processed_file import ProcessedFile, ProcessedFileBase, ProcessedFileFilter, ProcessedFileUpdate
from typing import List, Optional

class ProcessedFileService:
    def __init__(self):
        self.repository = processed_file_repository

    def get_by_id(self, file_id: str) -> Optional[ProcessedFile]:
        data = self.repository.get_by_id(file_id)
        return ProcessedFile(**data) if data else None

    def search(self, filter_params: ProcessedFileFilter) -> List[ProcessedFile]:
        if filter_params.original_file_id is not None:
            data = self.repository.get_by_original_file_id(str(filter_params.original_file_id))
        else:
            data = self.repository.get_by_analysis_id(filter_params.analysis_id)
        return [ProcessedFile(**item) for item in data]

    def get_merged(self, filter_params: ProcessedFileFilter) -> List[ProcessedFile]:
        data = self.repository.get_merged_by_analysis_id(filter_params.analysis_id)
        return [ProcessedFile(**item) for item in data]

    def create(self, file_data: ProcessedFileBase) -> ProcessedFile:
        data = self.repository.create(file_data.model_dump(mode="json", exclude_none=True))
        return ProcessedFile(**data)

    def update(self, file_id: str, update_data: ProcessedFileUpdate) -> Optional[ProcessedFile]:
        update_dict = update_data.model_dump(mode="json", exclude_unset=True)
        data = self.repository.update_by_id(file_id, update_dict)
        return ProcessedFile(**data) if data else None

processed_file_service = ProcessedFileService()
