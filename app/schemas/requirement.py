from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class RequirementBase(BaseModel):
    analysis_id: UUID
    category: Optional[str] = None
    requirement_code: str
    requirement_text: str
    is_mandatory: Optional[bool] = None
    page_reference: Optional[str] = None
    rag_chunk_id: Optional[str] = None

class Requirement(RequirementBase):
    id: UUID
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class RequirementFilter(BaseModel):
    analysis_id: UUID
    limit: int = 20
    offset: int = 0
