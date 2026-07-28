from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from uuid import UUID
from app.schemas.processed_file import ProcessedFile, ProcessedFileBase, ProcessedFileFilter, ProcessedFileUpdate
from app.services.processed_file_service import processed_file_service

router = APIRouter()

@router.get("/{file_id}", response_model=ProcessedFile)
def get_processed_file(file_id: UUID):
    result = processed_file_service.get_by_id(str(file_id))
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return result

@router.post("/", response_model=ProcessedFile)
def create_processed_file(file_data: ProcessedFileBase):
    try:
        return processed_file_service.create(file_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=List[ProcessedFile])
def search_processed_files(filter_params: ProcessedFileFilter):
    try:
        return processed_file_service.search(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/merged", response_model=List[ProcessedFile])
def get_merged_files(filter_params: ProcessedFileFilter):
    try:
        return processed_file_service.get_merged(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{file_id}", response_model=ProcessedFile)
def update_processed_file(file_id: UUID, update_data: ProcessedFileUpdate):
    result = processed_file_service.update(str(file_id), update_data)
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return result

@router.delete("/by-analysis/{analysis_id}")
def delete_processed_files_by_analysis(
    analysis_id: UUID,
    is_merged: Optional[bool] = Query(None),
):
    try:
        deleted = processed_file_service.delete_by_analysis_id(str(analysis_id), is_merged)
        return {"deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
