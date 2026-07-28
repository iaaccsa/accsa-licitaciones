from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class TenderBase(BaseModel):
    analysis_id: Optional[UUID] = None
    label: Optional[str] = None
    provider_name: Optional[str] = None

class Tender(TenderBase):
    id: UUID
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class TenderFilter(BaseModel):
    analysis_id: UUID

class TenderUpdate(BaseModel):
    label: Optional[str] = None
    provider_name: Optional[str] = None
