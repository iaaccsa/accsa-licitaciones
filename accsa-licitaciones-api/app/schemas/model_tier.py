from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

from app.schemas.analysis import ModelTierRole, PrimaryModel


class ModelTier(BaseModel):
    id: UUID
    role: ModelTierRole
    provider: PrimaryModel
    model_id: str
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


class ModelSelection(BaseModel):
    """A model plus the reasoning value to send with every call to it. `reasoning`
    goes to `reasoning_effort` on OpenAI and to `thinking_level` on Gemini."""

    role: ModelTierRole
    provider: PrimaryModel
    model_id: str
    reasoning: str


class AnalysisModelConfig(BaseModel):
    analysis_id: UUID
    primary: ModelSelection
    secondary: Optional[ModelSelection] = None
    # Compat with the service images already deployed, which read provider,
    # model_id and fallback_model_id. Drop once every image reads primary and
    # secondary.
    provider: PrimaryModel
    model_id: str
    fallback_model_id: Optional[str] = None
