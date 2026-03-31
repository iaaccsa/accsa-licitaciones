from fastapi import APIRouter, HTTPException
from typing import List
from uuid import UUID
from app.schemas.file import File, FileBase, FileFilter, FileUpdate
from app.services.file_service import file_service

router = APIRouter()

@router.get("/{file_id}", response_model=File)
def get_file(file_id: UUID):
    """
    Get a file by ID.
    """
    result = file_service.get_file_by_id(str(file_id))
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return result

@router.post("/", response_model=File)
def create_file(file_data: FileBase):
    """
    Create a new file record.
    """
    try:
        return file_service.create_file(file_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=List[File])
def search_files(filter_params: FileFilter):
    """
    Search files by analysis_id from files_view.
    """
    try:
        return file_service.search_files(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/merged", response_model=List[File])
def get_merged_files(filter_params: FileFilter):
    """
    Get files with is_merged=true for a given analysis_id.
    """
    try:
        return file_service.get_merged_files(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{file_id}", response_model=File)
def update_file(file_id: UUID, update_data: FileUpdate):
    try:
        result = file_service.update_file(str(file_id), update_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return result
