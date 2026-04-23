from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional
from uuid import UUID


class ReqDomain(str, Enum):
    technical      = "technical"
    administrative = "administrative"
    legal          = "legal"
    financial      = "financial"
    hr             = "hr"
    logistics      = "logistics"
    environmental  = "environmental"
    quality        = "quality"
    safety         = "safety"
    other          = "other"


class ReqVerificationMethod(str, Enum):
    attached_document          = "attached_document"
    sworn_statement            = "sworn_statement"
    external_certificate       = "external_certificate"
    inspection                 = "inspection"
    sample                     = "sample"
    site_visit                 = "site_visit"
    auto_verifiable_from_offer = "auto_verifiable_from_offer"
    other                      = "other"


class ReqTemporalScope(str, Enum):
    at_bid_time      = "at_bid_time"
    pre_award        = "pre_award"
    during_execution = "during_execution"
    post_sale        = "post_sale"
    other            = "other"


VALID_ROLES = {
    "admisibilidad_obligatoria",
    "admisibilidad_subsanable",
    "puntuable",
    "penalizador",
    "informativo",
    "preferencia_legal",
    "desconocido_pendiente_pliego_general",
}


class MappedFactor(BaseModel):
    factor_id:    str
    weight_type:  Literal["points", "percent", "formula", "none"]
    weight_value: Optional[float] = None
    formula:      Optional[str]   = None
    block:        Optional[Literal["cualitativo", "cuantitativo"]] = None


class RequirementWeight(BaseModel):
    type:    Literal["points", "percent", "formula", "none"] = "none"
    value:   Optional[float] = None
    formula: Optional[str]   = None
    block:   Optional[Literal["cualitativo", "cuantitativo"]] = None


class RequirementCitation(BaseModel):
    chunk_id: str
    page:     Optional[str] = None
    snippet:  str


class AnalysisRequirementCreate(BaseModel):
    requirement_code:    str
    requirement_text:    str
    requirement_summary: Optional[str] = None

    roles:               List[str]
    mapped_factors:      List[MappedFactor]    = []
    domain:              ReqDomain             = ReqDomain.other
    weight:              RequirementWeight     = RequirementWeight()
    verification_method: ReqVerificationMethod = ReqVerificationMethod.other
    temporal_scope:      ReqTemporalScope      = ReqTemporalScope.at_bid_time

    citations:           List[RequirementCitation] = []

    confidence:          Literal["alta", "media", "baja", "muy_baja"] = "media"
    extraction_batch_id: Optional[int]  = None
    is_admissibility:    bool           = False
    notes:               Optional[str]  = None

    @field_validator("roles")
    @classmethod
    def _validate_roles(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("roles must contain at least one value")
        invalid = [r for r in v if r not in VALID_ROLES]
        if invalid:
            raise ValueError(f"Invalid roles: {invalid}. Allowed: {sorted(VALID_ROLES)}")
        return v


class AnalysisRequirementRead(AnalysisRequirementCreate):
    id:          UUID
    analysis_id: UUID
    is_verified: bool
    created_at:  datetime
    updated_at:  datetime

    model_config = ConfigDict(from_attributes=True)


class AnalysisRequirementBulkCreate(BaseModel):
    analysis_id:  UUID
    requirements: List[AnalysisRequirementCreate]


class AnalysisRequirementUpdate(BaseModel):
    roles:               Optional[List[str]]              = None
    mapped_factors:      Optional[List[MappedFactor]]     = None
    domain:              Optional[ReqDomain]              = None
    weight:              Optional[RequirementWeight]      = None
    verification_method: Optional[ReqVerificationMethod]  = None
    temporal_scope:      Optional[ReqTemporalScope]       = None
    is_admissibility:    Optional[bool]                   = None
    is_verified:         Optional[bool]                   = None
    notes:               Optional[str]                   = None

    @field_validator("roles")
    @classmethod
    def _validate_roles(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        if not v:
            raise ValueError("roles must contain at least one value")
        invalid = [r for r in v if r not in VALID_ROLES]
        if invalid:
            raise ValueError(f"Invalid roles: {invalid}. Allowed: {sorted(VALID_ROLES)}")
        return v


class BulkReplaceResponse(BaseModel):
    analysis_id: UUID
    inserted:    int
    deleted:     int


class BulkVerifyResponse(BaseModel):
    analysis_id: UUID
    updated:     int
