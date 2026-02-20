from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.event import Event, EventBase, EventFilter
from app.services.event_service import event_service

router = APIRouter()

@router.post("/search", response_model=List[Event])
def search_events(filter_params: EventFilter):
    """
    Search events by analysis_id with pagination.
    """
    try:
        return event_service.search_events(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=Event)
def create_event(event_data: EventBase):
    """
    Create a new event.
    """
    try:
        return event_service.create_event(event_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
