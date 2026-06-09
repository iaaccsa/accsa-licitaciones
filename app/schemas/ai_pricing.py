from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from typing import Optional
from uuid import UUID


class AiPricing(BaseModel):
    id: UUID
    provider: str
    model: str
    operation: str
    unit_type: str
    unit_scale: int
    input_price: float
    output_price: float
    cached_input_price: Optional[float] = None
    currency: str
    captured_at: date
    source_note: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
