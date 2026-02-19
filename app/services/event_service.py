from app.repositories.event_repository import event_repository
from app.schemas.event import Event, EventFilter
from typing import List

class EventService:
    def __init__(self):
        self.repository = event_repository

    def search_events(self, filter_params: EventFilter) -> List[Event]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id,
            limit=filter_params.limit,
            offset=filter_params.offset
        )
        return [Event(**item) for item in data]

event_service = EventService()
