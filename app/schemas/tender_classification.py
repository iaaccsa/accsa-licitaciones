from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID


# --- Sub-modelos (perfil de evaluación v2) -----------------------------------

class EvaluationFactor(BaseModel):
    id: str
    label: str
    weight_type: Literal["points", "percent", "formula", "none"]
    weight_value: Optional[float] = None
    formula: Optional[str] = None
    block: Optional[Literal["cualitativo", "cuantitativo"]] = None
    is_negative: bool = False
    citations: List[str] = Field(default_factory=list)


class RoleSignal(BaseModel):
    detected: bool
    evidence: List[str] = Field(default_factory=list)


class DetectedRoleSignals(BaseModel):
    admisibilidad_obligatoria: RoleSignal
    admisibilidad_subsanable: RoleSignal
    puntuable: RoleSignal
    penalizador: RoleSignal
    informativo: RoleSignal
    preferencia_legal: RoleSignal


class EnabledRole(BaseModel):
    enabled: bool
    source: Literal[
        "both",
        "strategy_default",
        "strategy_required",
        "strategy",
        "text_only_rejected",
        "none",
    ]
    evidence: List[str] = Field(default_factory=list)


# --- Schemas principales -----------------------------------------------------

class TenderClassificationCreate(BaseModel):
    analysis_id: UUID
    system_type: str
    confidence: str

    # Campos existentes
    evidence: List[Any] = Field(default_factory=list)
    detected_factors: List[Any] = Field(default_factory=list)
    discarded: Dict[str, Any] = Field(default_factory=dict)
    sufficient_chunks: bool = True
    additional_chunks_recommendation: Optional[str] = None

    # Campos nuevos (perfil de evaluación v2)
    factors: List[EvaluationFactor] = Field(default_factory=list)
    role_signals: Optional[DetectedRoleSignals] = None
    enabled_roles: Dict[str, EnabledRole] = Field(default_factory=dict)
    profile_warnings: List[str] = Field(default_factory=list)
    profile_version: int = 1


class TenderClassification(TenderClassificationCreate):
    id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
