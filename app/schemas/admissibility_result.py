from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List, Any, Literal
from uuid import UUID
from enum import Enum


class AdmissibilityVerdict(str, Enum):
    # Admissibility verdicts are binary (Feature 08). The matcher collapses any
    # non-cumple verdict to no_cumple before persisting; the DB enforces it via
    # admissibility_results_verdict_binary_check. The general compliance matrix
    # keeps its own 6-value enum.
    cumple    = "cumple"
    no_cumple = "no_cumple"


Confidence = Literal["alta", "media", "baja", "muy_baja"]


class ComplianceCitation(BaseModel):
    chunk_id:    str
    snippet:     str
    header:      Optional[str] = None
    chunk_index: Optional[int] = None
    page_number: Optional[int] = None
    filename:    Optional[str] = None


class AdmissibilityResultEntryCreate(BaseModel):
    requirement_id:               UUID
    verdict:                      AdmissibilityVerdict
    confidence:                   Confidence               = "media"
    reasoning:                    Optional[str]            = None
    missing_elements:             List[str]                = Field(default_factory=list)
    citations:                    List[ComplianceCitation] = Field(default_factory=list)
    manual_verification_required: bool                     = False
    extraction_batch_id:          Optional[int]            = None
    notes:                        Optional[str]            = None


class AdmissibilityResultEntryFlatCreate(AdmissibilityResultEntryCreate):
    analysis_id: UUID
    proposal_id: UUID


class AdmissibilityResultBulkCreate(BaseModel):
    analysis_id: UUID
    proposal_id: UUID
    entries:     List[AdmissibilityResultEntryCreate]


class AdmissibilityResultEntryRead(BaseModel):
    id:                           UUID
    analysis_id:                  UUID
    requirement_id:               UUID
    proposal_id:                  UUID
    verdict:                      AdmissibilityVerdict
    confidence:                   str
    reasoning:                    Optional[str]      = None
    missing_elements:             List[Any]          = []
    citations:                    List[Any]          = []
    manual_verification_required: bool
    extraction_batch_id:          Optional[int]      = None
    is_verified:                  bool
    reviewed_by:                  Optional[str]      = None
    reviewed_at:                  Optional[datetime] = None
    notes:                        Optional[str]      = None
    created_at:                   datetime
    updated_at:                   datetime

    model_config = ConfigDict(from_attributes=True)


class RequirementEmbedded(BaseModel):
    id:                  UUID
    requirement_code:    str
    requirement_text:    str
    requirement_summary: Optional[str] = None
    roles:               List[str]     = []
    domain:              str
    verification_method: str
    temporal_scope:      str


class AdmissibilityResultEntryReadWithRequirement(AdmissibilityResultEntryRead):
    requirement: RequirementEmbedded


class AdmissibilityResultEntryPatch(BaseModel):
    verdict:                      Optional[AdmissibilityVerdict] = None
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
