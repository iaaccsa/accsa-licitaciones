from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID


class AiUsageCreate(BaseModel):
    analysis_id: UUID
    proposal_id: Optional[UUID] = None
    service_name: str
    provider: str
    model: str
    operation: str
    unit_type: str
    unit_scale: int
    input_units: float = 0
    output_units: float = 0
    cached_input_units: float = 0
    input_price: float = 0
    output_price: float = 0
    cached_input_price: Optional[float] = None
    cost_usd: float = 0
    currency: str = "USD"
    attempt: int = 1
    success: bool = True
    model_found: bool = True


class AiUsage(AiUsageCreate):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CostByProposal(BaseModel):
    proposal_id: Optional[UUID] = None
    cost: float
    calls: int


class CostByProvider(BaseModel):
    provider: str
    cost: float
    calls: int


class CostByModel(BaseModel):
    provider: str
    model: str
    operation: str
    cost: float
    calls: int


class AiUsageCostSummary(BaseModel):
    analysis_id: UUID
    currency: str = "USD"
    total_cost: float
    total_calls: int
    by_proposal: list[CostByProposal]
    by_provider: list[CostByProvider]
    by_model: list[CostByModel]
