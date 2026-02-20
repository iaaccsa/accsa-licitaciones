from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID


class StartPipelineRequest(BaseModel):
    analysis_id: UUID
    proposal_id: Optional[UUID] = None


class StartPipelineResponse(BaseModel):
    analysis_id: UUID
    started_job: str
    message: str


class JobCallbackRequest(BaseModel):
    job_name: str
    analysis_id: UUID
    proposal_id: Optional[UUID] = None
    status: str  # "success" | "failed"
    error_message: Optional[str] = None


class JobCallbackResponse(BaseModel):
    received: bool
    next_jobs_started: List[str]
    message: str
