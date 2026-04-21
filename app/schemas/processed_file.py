from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

class ProcessedFileBase(BaseModel):
    analysis_id: UUID
    original_file_id: Optional[UUID] = None
    file_name: Optional[str] = None
    storage_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    is_merged: bool = False
    metadata: Optional[Dict[str, Any]] = None
    total_chunks: Optional[int] = None
    category: Optional[str] = None
    proposal_id: Optional[UUID] = None
    tender_id: Optional[UUID] = None

class ProcessedFile(ProcessedFileBase):
    id: Optional[UUID] = None
    created_at: datetime
    original_file_name: Optional[str] = None
    original_storage_path: Optional[str] = None
    original_mime_type: Optional[str] = None
    proposal_label: Optional[str] = None
    digital_signatures: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

class ProcessedFileFilter(BaseModel):
    analysis_id: Optional[UUID] = None
    original_file_id: Optional[UUID] = None

class ProcessedFileUpdate(BaseModel):
    metadata: Optional[Dict[str, Any]] = None
    total_chunks: Optional[int] = None
    category: Optional[str] = None
    proposal_id: Optional[UUID] = None
    tender_id: Optional[UUID] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    digital_signatures: Optional[Dict[str, Any]] = None
