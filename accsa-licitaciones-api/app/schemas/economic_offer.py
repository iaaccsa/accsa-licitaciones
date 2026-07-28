from decimal import Decimal
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

EconomicConfidence = Literal["alta", "media", "baja", "muy_baja"]
TotalAmount = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2)]


class EconomicCitation(BaseModel):
    chunk_id:    str
    snippet:     str
    header:      Optional[str] = None
    chunk_index: Optional[int] = None


class EconomicLineItem(BaseModel):
    code:        Optional[str]     = None
    description: str
    quantity:    Optional[float]   = None
    unit_price:  Optional[Decimal] = None
    subtotal:    Optional[Decimal] = None
    currency:    Optional[str]     = None


class ProposalEconomicOfferBase(BaseModel):
    total_amount:           Optional[TotalAmount]       = None
    currency:               Optional[str]               = None
    includes_taxes:         Optional[bool]              = None
    tax_details:            Optional[Dict[str, Any]]    = None
    payment_terms:          Optional[str]               = None
    validity_days:          Optional[int]               = Field(default=None, ge=0)
    adjustment_formula:     Optional[str]               = None
    line_items:             List[EconomicLineItem]      = Field(default_factory=list)
    citations:              List[EconomicCitation]      = Field(default_factory=list)
    confidence:             EconomicConfidence          = "media"
    reasoning:              Optional[str]               = None
    requires_manual_review: bool                        = False
    extracted_by:           Optional[str]               = None
    notes:                  Optional[str]               = None


class ProposalEconomicOfferCreate(ProposalEconomicOfferBase):
    analysis_id: UUID
    proposal_id: UUID


class ProposalEconomicOfferRead(ProposalEconomicOfferBase):
    id:          UUID
    analysis_id: UUID
    proposal_id: UUID
    is_verified: bool
    reviewed_by: Optional[str]      = None
    reviewed_at: Optional[datetime] = None
    created_at:  datetime
    updated_at:  datetime

    model_config = ConfigDict(from_attributes=True)


class ProposalEconomicOfferPatch(BaseModel):
    total_amount:           Optional[TotalAmount]            = None
    currency:               Optional[str]                    = None
    includes_taxes:         Optional[bool]                   = None
    tax_details:            Optional[Dict[str, Any]]         = None
    payment_terms:          Optional[str]                    = None
    validity_days:          Optional[int]                    = None
    adjustment_formula:     Optional[str]                    = None
    line_items:             Optional[List[EconomicLineItem]] = None
    requires_manual_review: Optional[bool]                   = None
    reasoning:              Optional[str]                    = None
    notes:                  Optional[str]                    = None
    is_verified:            Optional[bool]                   = None
    reviewed_by:            Optional[str]                    = None
