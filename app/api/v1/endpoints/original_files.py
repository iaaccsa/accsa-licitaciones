from fastapi import APIRouter, HTTPException
from typing import List
from uuid import UUID
from app.schemas.original_file import OriginalFile, OriginalFileBase, OriginalFileFilter, OriginalFileUpdate
from app.services.original_file_service import original_file_service

router = APIRouter()

@router.get("/{file_id}", response_model=OriginalFile)
def get_original_file(file_id: UUID):
    result = original_file_service.get_by_id(str(file_id))
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return result

@router.post("/", response_model=OriginalFile)
def create_original_file(file_data: OriginalFileBase):
    try:
        return original_file_service.create(file_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=List[OriginalFile])
def search_original_files(filter_params: OriginalFileFilter):
    try:
        return original_file_service.search(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{file_id}", response_model=OriginalFile)
def update_original_file(file_id: UUID, update_data: OriginalFileUpdate):
    try:
        result = original_file_service.update(str(file_id), update_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    return result
