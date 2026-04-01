from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID


class TenderClassificationCreate(BaseModel):
    analysis_id: UUID
    system_type: str
    confidence: str
    evidence: List[Any] = []
    detected_factors: List[Any] = []
    discarded: Dict[str, Any] = {}
    sufficient_chunks: bool = True
    additional_chunks_recommendation: Optional[str] = None


class TenderClassification(BaseModel):
    id: UUID
    analysis_id: UUID
    system_type: str
    confidence: str
    evidence: List[Any]
    detected_factors: List[Any]
    discarded: Dict[str, Any]
    sufficient_chunks: bool
    additional_chunks_recommendation: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
