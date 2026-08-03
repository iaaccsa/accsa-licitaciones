from enum import Enum
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional
from uuid import UUID

class PrimaryModel(str, Enum):
    gemini = "gemini"
    openai = "openai"

class IntelligenceLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"

class ModelTierRole(str, Enum):
    primary = "primary"
    secondary = "secondary"

class OpenAiReasoningEffort(str, Enum):
    """`reasoning_effort` values the gpt-5.6 family accepts on chat.completions,
    verified against the API. Omitting the parameter is the same as "medium"."""

    none = "none"
    low = "low"
    medium = "medium"
    high = "high"
    xhigh = "xhigh"

class GeminiThinkingLevel(str, Enum):
    """`thinking_level` values gemini-3.6-flash accepts inside generation_config.
    There is no "off": "minimal" is the floor. Default is "medium"."""

    minimal = "minimal"
    low = "low"
    medium = "medium"
    high = "high"

class AnalysisBase(BaseModel):
    status: str
    slug: str
    artifact_path: str
    is_success: Optional[bool] = None
    user_assigned_name: Optional[str] = None
    user_email: Optional[str] = None
    generated_name: Optional[str] = None
    paused_at_service: Optional[str] = None
    hitl: Optional[bool] = None
    primary_model: Optional[PrimaryModel] = None
    intelligence_level: Optional[IntelligenceLevel] = None
    # Frozen at creation: changing the global config must not alter an analysis
    # that is already running.
    openai_reasoning_effort: Optional[OpenAiReasoningEffort] = None
    gemini_thinking_level: Optional[GeminiThinkingLevel] = None
    created_by: Optional[UUID] = None

class Analysis(AnalysisBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    total_events: Optional[int] = None
    total_files: Optional[int] = None
    total_proposals: Optional[int] = None
    total_requirements: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class AnalysisFromStoragePath(BaseModel):
    storage_path: str
    user_assigned_name: Optional[str] = None
    user_email: Optional[str] = None
    created_by: Optional[UUID] = None

class AnalysisUpdate(BaseModel):
    generated_name: Optional[str] = None
    user_assigned_name: Optional[str] = Field(default=None, max_length=200)

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
