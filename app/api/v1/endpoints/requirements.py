from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.requirement import Requirement, RequirementBase, RequirementFilter
from app.services.requirement_service import requirement_service

router = APIRouter()

@router.post("/", response_model=List[Requirement])
def create_requirements(items: List[RequirementBase]):
    try:
        return requirement_service.create_bulk_requirements(items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=List[Requirement])
def search_requirements(filter_params: RequirementFilter):
    """
    Search requirements by analysis_id with pagination.
    """
    try:
        return requirement_service.search_requirements(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
