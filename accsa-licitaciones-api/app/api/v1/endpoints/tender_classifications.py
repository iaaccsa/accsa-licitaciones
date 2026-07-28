from fastapi import APIRouter, HTTPException
from uuid import UUID
from app.schemas.tender_classification import TenderClassification, TenderClassificationCreate
from app.services.tender_classification_service import tender_classification_service

router = APIRouter()


@router.post("/", response_model=TenderClassification, status_code=201)
def upsert_tender_classification(data: TenderClassificationCreate):
    try:
        return tender_classification_service.upsert(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{analysis_id}", response_model=TenderClassification)
def get_tender_classification(analysis_id: UUID):
    result = tender_classification_service.get_by_analysis_id(str(analysis_id))
    if not result:
        raise HTTPException(status_code=404, detail="Tender classification not found")
    return result
