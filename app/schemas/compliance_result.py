from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class ComplianceResultBase(BaseModel):
    analysis_id: Optional[UUID] = None
    proposal_id: Optional[UUID] = None
    requirement_id: Optional[UUID] = None
    requirement_code: Optional[str] = None
    requirement_text: Optional[str] = None
    requirement_category: Optional[str] = None
    requirement_is_mandatory: Optional[bool] = None
    requirement_page_reference: Optional[str] = None
    status: Optional[str] = None
    evidence_quote: Optional[str] = None
    reasoning: Optional[str] = None
    suggestion: Optional[str] = None

class ComplianceResult(ComplianceResultBase):
    id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ComplianceResultFilter(BaseModel):
    proposal_id: UUID
    limit: int = 20
    offset: int = 0

class ComplianceResultCreate(BaseModel):
    proposal_id: UUID
    requirement_id: UUID
    status: str
    evidence_quote: Optional[str] = None
    reasoning: Optional[str] = None
    suggestion: Optional[str] = None
