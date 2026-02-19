from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.file import File, FileFilter
from app.services.file_service import file_service

router = APIRouter()

@router.post("/search", response_model=List[File])
def search_files(filter_params: FileFilter):
    """
    Search files by analysis_id from files_view.
    """
    try:
        return file_service.search_files(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
