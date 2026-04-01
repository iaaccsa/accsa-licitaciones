from typing import Optional
from pydantic import BaseModel, ConfigDict


class TenderEvaluationType(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    title: str
    description: str
    example: str
    icon: str
    color_badge: str
    background_color: str
    extraction_complexity: str
    requires_additional_document: bool
    typical_factors: list[str]
    frequent_organizations: list[str]
    observed_frequency: int
    main_formula: Optional[str]
    key_signals: list[str]
    notes: list[str]
