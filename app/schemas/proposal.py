from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

class ProposalBase(BaseModel):
    analysis_id: Optional[UUID] = None
    provider_name: Optional[str] = None
    label: Optional[str] = None
    is_success: Optional[bool] = None
    status: Optional[str] = None
    audit_results: Optional[Dict[str, Any]] = None

class Proposal(ProposalBase):
    id: UUID
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProposalFilter(BaseModel):
    analysis_id: UUID
