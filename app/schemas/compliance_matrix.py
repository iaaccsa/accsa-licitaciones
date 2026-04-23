from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from uuid import UUID
from enum import Enum


class ComplianceVerdict(str, Enum):
    cumple                       = "cumple"
    cumple_parcial               = "cumple_parcial"
    no_cumple                    = "no_cumple"
    no_evidencia                 = "no_evidencia"
    no_aplica                    = "no_aplica"
    requiere_verificacion_manual = "requiere_verificacion_manual"


Confidence = Literal["alta", "media", "baja", "muy_baja"]


class ComplianceCitation(BaseModel):
    chunk_id:    str
    snippet:     str
    header:      Optional[str] = None
    chunk_index: Optional[int] = None


class ComplianceEntryCreate(BaseModel):
    requirement_id:               UUID
    verdict:                      ComplianceVerdict
    confidence:                   Confidence                   = "media"
    reasoning:                    Optional[str]                = None
    missing_elements:             List[str]                    = Field(default_factory=list)
    citations:                    List[ComplianceCitation]     = Field(default_factory=list)
    manual_verification_required: bool                         = False
    extraction_batch_id:          Optional[int]                = None
    notes:                        Optional[str]                = None


class ComplianceEntryFlatCreate(ComplianceEntryCreate):
    analysis_id: UUID
    proposal_id: UUID


class ComplianceMatrixBulkCreate(BaseModel):
    analysis_id: UUID
    proposal_id: UUID
    entries:     List[ComplianceEntryCreate]


class ComplianceEntryRead(BaseModel):
    id:                           UUID
    analysis_id:                  UUID
    requirement_id:               UUID
    proposal_id:                  UUID
    verdict:                      ComplianceVerdict
    confidence:                   str
    reasoning:                    Optional[str]            = None
    missing_elements:             List[Any]                = []
    citations:                    List[Any]                = []
    manual_verification_required: bool
    extraction_batch_id:          Optional[int]            = None
    is_verified:                  bool
    reviewed_by:                  Optional[str]            = None
    reviewed_at:                  Optional[datetime]       = None
    notes:                        Optional[str]            = None
    created_at:                   datetime
    updated_at:                   datetime

    model_config = ConfigDict(from_attributes=True)


class RequirementEmbedded(BaseModel):
    id:                  UUID
    requirement_code:    str
    requirement_text:    str
    requirement_summary: Optional[str]  = None
    roles:               List[str]      = []
    domain:              str
    weight:              Dict[str, Any] = {}
    verification_method: str
    temporal_scope:      str


class ComplianceEntryReadWithRequirement(ComplianceEntryRead):
    requirement: RequirementEmbedded


class ComplianceMatrixViewEntry(BaseModel):
    id:                               UUID
    analysis_id:                      UUID
    requirement_id:                   UUID
    proposal_id:                      UUID
    verdict:                          ComplianceVerdict
    confidence:                       str
    reasoning:                        Optional[str]      = None
    missing_elements:                 List[Any]          = []
    citations:                        List[Any]          = []
    manual_verification_required:     bool
    extraction_batch_id:              Optional[int]      = None
    is_verified:                      bool
    reviewed_by:                      Optional[str]      = None
    reviewed_at:                      Optional[datetime] = None
    notes:                            Optional[str]      = None
    created_at:                       datetime
    updated_at:                       datetime
    analysis_slug:                    str
    requirement_code:                 str
    requirement_text:                 str
    requirement_summary:              Optional[str]      = None
    requirement_roles:                List[str]          = []
    requirement_mapped_factors:       Optional[Any]      = None
    requirement_domain:               Optional[str]      = None
    requirement_weight:               Optional[Any]      = None
    requirement_verification_method:  Optional[str]      = None
    requirement_temporal_scope:       Optional[str]      = None
    requirement_citations:            List[Any]          = []
    requirement_confidence:           Optional[str]      = None
    requirement_extraction_batch_id:  Optional[int]      = None
    requirement_is_verified:          bool               = False
    requirement_notes:                Optional[str]      = None
    requirement_created_at:           Optional[datetime] = None
    requirement_updated_at:           Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ComplianceEntryPatch(BaseModel):
    verdict:                      Optional[ComplianceVerdict] = None
    confidence:                   Optional[Confidence]        = None
    reasoning:                    Optional[str]               = None
    missing_elements:             Optional[List[str]]         = None
    manual_verification_required: Optional[bool]              = None
    is_verified:                  Optional[bool]              = None
    reviewed_by:                  Optional[str]               = None
    notes:                        Optional[str]               = None


class BulkReplaceMatrixResponse(BaseModel):
    analysis_id: UUID
    proposal_id: UUID
    inserted:    int
    deleted:     int


class DeleteByProposalResponse(BaseModel):
    deleted: int


class BatchInsertResponse(BaseModel):
    inserted: int
