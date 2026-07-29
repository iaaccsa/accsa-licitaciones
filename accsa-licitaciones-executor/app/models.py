from datetime import datetime
from enum import Enum
from typing import Dict, Optional
from uuid import UUID

from pydantic import BaseModel


class ExecutionState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    STOPPED = "stopped"


TERMINAL_STATES = frozenset(
    {
        ExecutionState.SUCCEEDED,
        ExecutionState.FAILED,
        ExecutionState.TIMED_OUT,
        ExecutionState.STOPPED,
    }
)


class StartJobRequest(BaseModel):
    """The five identity fields mirror the API's JobCallbackRequest minus status
    and error_message. They are stored verbatim and echoed back when the executor
    has to synthesize a failure callback: the container environment cannot tell
    file_id from original_file_id, since both travel as FILE_ID."""

    service_name: str
    analysis_id: UUID
    proposal_id: Optional[UUID] = None
    file_id: Optional[UUID] = None
    original_file_id: Optional[UUID] = None
    env: Dict[str, str]


class StartJobResponse(BaseModel):
    execution_id: UUID
    execution_name: str
    state: ExecutionState


class ExecutionStatusResponse(BaseModel):
    execution_id: UUID
    execution_name: str
    service_name: str
    state: ExecutionState
    exit_code: Optional[int] = None
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class HealthResponse(BaseModel):
    status: str
    version: str
    docker: str
    running: int
    queued: int
    capacity: int
