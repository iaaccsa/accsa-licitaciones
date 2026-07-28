from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

from app.schemas.analysis import PrimaryModel, IntelligenceLevel


class ModelTier(BaseModel):
    id: UUID
    provider: PrimaryModel
    level: IntelligenceLevel
    model_id: str
    fallback_model_id: Optional[str] = None
    display_name: str
    description: Optional[str] = None
    input_price_per_1m: Optional[float] = None
    output_price_per_1m: Optional[float] = None
    cached_input_price_per_1m: Optional[float] = None
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnalysisModelConfig(BaseModel):
    analysis_id: UUID
    provider: PrimaryModel
    level: IntelligenceLevel
    model_id: str
    fallback_model_id: Optional[str] = None
