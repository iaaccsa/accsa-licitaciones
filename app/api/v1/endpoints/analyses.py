from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
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

@router.post("/", response_model=Analysis)
async def create_analysis(file: UploadFile = File(...)):
    """
    Create a new analysis by uploading a ZIP file.
    """
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")
    
    try:
        return await analysis_service.create_analysis(file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
