from enum import Enum
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class AnalysisBase(BaseModel):
    status: str
    slug: str
    artifact_path: str
    is_success: Optional[bool] = None
    user_name: Optional[str] = None
    generated_name: Optional[str] = None
    paused_at_service: Optional[str] = None

class Analysis(AnalysisBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    total_events: Optional[int] = None
    total_files: Optional[int] = None
    total_proposals: Optional[int] = None
    total_requirements: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class AnalysisUpdate(BaseModel):
    generated_name: Optional[str] = None

class AnalysisStatusUpdate(BaseModel):
    status: str
    is_success: Optional[bool] = None

class SourceType(str, Enum):
    proposal = "proposal"
    tender = "tender"

class AnalysisSource(BaseModel):
    type: SourceType
    id: UUID
    label: str
