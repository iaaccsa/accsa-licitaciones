from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

class WorkflowStepBase(BaseModel):
    analysis_id: UUID
    proposal_id: Optional[UUID] = None
    code: str
    display_name: str
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    error_log: Optional[str] = None
    ui_metadata: Optional[Dict[str, Any]] = None
    parent_code: Optional[str] = None

class WorkflowStep(WorkflowStepBase):
    id: UUID
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class WorkflowStepFilter(BaseModel):
    analysis_id: UUID
