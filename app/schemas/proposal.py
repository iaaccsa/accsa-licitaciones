from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID
from enum import Enum


class ProposalMatchingStatus(str, Enum):
    pending        = "pending"
    matching       = "matching"
    matrix_ready   = "matrix_ready"
    summarizing    = "summarizing"
    completed      = "completed"
    failed         = "failed"
    summary_failed = "summary_failed"


class ProposalAdmissibilityStatus(str, Enum):
    pending    = "pending"
    evaluating = "evaluating"
    admitida   = "admitida"
    rechazada  = "rechazada"
    failed     = "failed"


class AdmissibilityReason(BaseModel):
    type:             str
    requirement_id:   Optional[str] = None
    requirement_code: Optional[str] = None
    verdict:          Optional[str] = None
    reasoning:        Optional[str] = None


class ProposalBase(BaseModel):
    label:             str
    provider_name:     Optional[str]            = None
    provider_metadata: Optional[Dict[str, Any]] = None


class ProposalCreate(ProposalBase):
    analysis_id: UUID


class ProposalRead(ProposalBase):
    id:                       UUID
    analysis_id:              UUID
    matching_status:          ProposalMatchingStatus
    matching_started_at:      Optional[datetime] = None
    matching_completed_at:    Optional[datetime] = None
    matching_error:           Optional[str]      = None
    summarizing_started_at:   Optional[datetime] = None
    summarizing_completed_at: Optional[datetime] = None
    summary_error:            Optional[str]      = None
    compliance_rate:          Optional[float]    = None
    compliance_counts:        Optional[Dict[str, int]] = None
    compliance_summary:       Optional[str]      = None
    critical_failures_count:  Optional[int]      = None
    admissibility_status:        ProposalAdmissibilityStatus  = ProposalAdmissibilityStatus.pending
    admissibility_started_at:    Optional[datetime]           = None
    admissibility_completed_at:  Optional[datetime]           = None
    admissibility_error:         Optional[str]                = None
    admissibility_reasons:       List[AdmissibilityReason]    = []
    admissibility_overridden_by: Optional[str]                = None
    created_at:               datetime
    updated_at:               datetime

    model_config = ConfigDict(from_attributes=True)


class ProposalUpdate(BaseModel):
    label:             Optional[str]            = None
    provider_name:     Optional[str]            = None
    provider_metadata: Optional[Dict[str, Any]] = None


# --- Payloads de la máquina de estados ---

class ProposalMatchingStart(BaseModel):
    matching_started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProposalMatchingResult(BaseModel):
    matching_completed_at: datetime


class ProposalMatchingFailure(BaseModel):
    matching_completed_at: datetime
    matching_error:        str


class ProposalSummaryStart(BaseModel):
    summarizing_started_at: datetime


class ProposalSummaryResult(BaseModel):
    summarizing_completed_at: datetime
    compliance_rate:          float = Field(ge=0, le=100)
    compliance_counts:        Dict[str, int]
    compliance_summary:       str
    critical_failures_count:  int = Field(ge=0)


class ProposalSummaryFailure(BaseModel):
    summarizing_completed_at: datetime
    summary_error:            str


class ProposalAdmissibilityStart(BaseModel):
    admissibility_started_at: datetime


class ProposalAdmissibilityResult(BaseModel):
    admissibility_completed_at: datetime
    admissibility_status:       str
    admissibility_reasons:      List[AdmissibilityReason]


class ProposalAdmissibilityFailure(BaseModel):
    admissibility_completed_at: datetime
    admissibility_error:        str


class ProposalAdmissibilityOverride(BaseModel):
    admissibility_status: str
    overridden_by:        str
