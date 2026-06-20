from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.schemas.analysis import PrimaryModel, IntelligenceLevel


class LlmConfig(BaseModel):
    primary_model: PrimaryModel
    intelligence_level: IntelligenceLevel


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
