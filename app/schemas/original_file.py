from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class OriginalFileBase(BaseModel):
    analysis_id: UUID
    file_name: Optional[str] = None
    storage_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    category: Optional[str] = None
    proposal_id: Optional[UUID] = None
    tender_id: Optional[UUID] = None
    is_reorderable: bool = True

class OriginalFile(OriginalFileBase):
    id: Optional[UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OriginalFileFilter(BaseModel):
    analysis_id: UUID

class OriginalFileUpdate(BaseModel):
    category: Optional[str] = None
    proposal_id: Optional[UUID] = None
    tender_id: Optional[UUID] = None
    is_reorderable: Optional[bool] = None
