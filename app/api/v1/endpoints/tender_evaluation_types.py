from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.tender_evaluation_type import TenderEvaluationType
from app.repositories.tender_evaluation_type_repository import tender_evaluation_type_repository

router = APIRouter()


@router.get("/", response_model=List[TenderEvaluationType])
def get_tender_evaluation_types():
    try:
        return tender_evaluation_type_repository.get_all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-label/{label}", response_model=TenderEvaluationType)
def get_tender_evaluation_type_by_label(label: str):
    result = tender_evaluation_type_repository.get_by_label(label)
    if not result:
        raise HTTPException(status_code=404, detail="Tender evaluation type not found")
    return result
