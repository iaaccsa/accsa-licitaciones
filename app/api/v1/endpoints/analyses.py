from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.schemas.analysis import Analysis
from app.services.analysis_service import analysis_service

router = APIRouter()

@router.get("/", response_model=List[Analysis])
def read_analyses():
    """
    Retrieve all analyses.
    """
    try:
        return analysis_service.get_all_analyses()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
