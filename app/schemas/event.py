from pydantic import BaseModel, ConfigDict
from time import time
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

class EventBase(BaseModel):
    analysis_id: UUID
    level: str
    message: str
    source: str
    details: Optional[Dict[str, Any]] = None

class Event(EventBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class EventFilter(BaseModel):
    analysis_id: UUID
    limit: int = 20
    offset: int = 0
