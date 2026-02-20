from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.file import File, FileBase, FileFilter
from app.services.file_service import file_service

router = APIRouter()

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
