from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID


class WorkflowPhaseBase(BaseModel):
    analysis_id: UUID
    code: str
    display_name: str
    status: Literal["pending", "running", "completed", "failed", "warning"] = "pending"
    progress: int = 0
    order: int
    type: Literal["processing", "approval"] = "processing"
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class WorkflowPhase(WorkflowPhaseBase):
    id: UUID
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class WorkflowPhaseFilter(BaseModel):
    analysis_id: UUID
