from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.schemas.analysis import (
    GeminiThinkingLevel,
    IntelligenceLevel,
    OpenAiReasoningEffort,
    PrimaryModel,
)


class LlmConfig(BaseModel):
    """Stored shape. primary_model and intelligence_level still drive analysis
    creation through model_tiers, so they stay until that table is reworked."""

    primary_model: PrimaryModel
    intelligence_level: IntelligenceLevel
    openai_reasoning_effort: OpenAiReasoningEffort = OpenAiReasoningEffort.medium
    gemini_thinking_level: GeminiThinkingLevel = GeminiThinkingLevel.medium


class LlmConfigUpdate(BaseModel):
    """What /admin/config/llm-config edits: the reasoning of each model. Anything
    else already stored is preserved by the service."""

    openai_reasoning_effort: OpenAiReasoningEffort
    gemini_thinking_level: GeminiThinkingLevel


class LlmConfigRead(LlmConfig):
    updated_at: Optional[datetime] = None


class HitlConfig(BaseModel):
    hitl: bool


class HitlConfigRead(HitlConfig):
    updated_at: Optional[datetime] = None


class NotificationsConfig(BaseModel):
    email_enabled: bool


class NotificationsConfigRead(NotificationsConfig):
    updated_at: Optional[datetime] = None


class InfraKeyStatus(BaseModel):
    set: bool = False
    updated_at: Optional[datetime] = None


class InfraConfigStatus(BaseModel):
    qdrant_url: InfraKeyStatus
    qdrant_api_key: InfraKeyStatus
    openai_api_key: InfraKeyStatus
    google_api_key: InfraKeyStatus
    mistral_api_key: InfraKeyStatus


class InfraConfigUpdate(BaseModel):
    # Empty/None = leave unchanged (write-only). Values never returned.
    qdrant_url: Optional[str] = None
    qdrant_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    mistral_api_key: Optional[str] = None
