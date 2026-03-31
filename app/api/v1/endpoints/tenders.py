from fastapi import APIRouter, HTTPException, Query
from typing import List
from uuid import UUID
from app.schemas.tender import Tender, TenderBase, TenderFilter, TenderUpdate
from app.services.tender_service import tender_service

router = APIRouter()

@router.get("/", response_model=List[Tender])
def list_tenders(analysis_id: UUID = Query(...)):
    try:
        return tender_service.search_tenders(TenderFilter(analysis_id=analysis_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=List[Tender])
def search_tenders(filter_params: TenderFilter):
    try:
        return tender_service.search_tenders(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=Tender)
def create_tender(tender_data: TenderBase):
    try:
        return tender_service.create_tender(tender_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{tender_id}", response_model=Tender)
def get_tender(tender_id: UUID):
    result = tender_service.get_tender_by_id(str(tender_id))
    if not result:
        raise HTTPException(status_code=404, detail="Tender not found")
    return result

@router.patch("/{tender_id}", response_model=Tender)
def update_tender(tender_id: UUID, update_data: TenderUpdate):
    result = tender_service.update_tender(str(tender_id), update_data)
    if not result:
        raise HTTPException(status_code=404, detail="Tender not found")
    return result
