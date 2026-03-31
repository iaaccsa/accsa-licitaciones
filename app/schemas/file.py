from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

class FileBase(BaseModel):
    analysis_id: Optional[UUID] = None
    file_name: Optional[str] = None
    storage_path: Optional[str] = None
    category: Optional[str] = None
    proposal_id: Optional[UUID] = None
    proposal_label: Optional[str] = None
    proposal_provider_name: Optional[str] = None
    tender_id: Optional[UUID] = None
    tender_label: Optional[str] = None
    tender_provider_name: Optional[str] = None
    link: Optional[UUID] = None
    is_merged: Optional[bool] = None
    is_processed_version: Optional[bool] = None
    is_reorderable: Optional[bool] = None
    total_chunks: Optional[int] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class File(FileBase):
    id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class FileFilter(BaseModel):
    analysis_id: UUID

class FileUpdate(BaseModel):
    category: Optional[str] = None
    proposal_id: Optional[UUID] = None
    tender_id: Optional[UUID] = None
    link: Optional[UUID] = None
    total_chunks: Optional[int] = None
    is_processed_version: Optional[bool] = None
    is_reorderable: Optional[bool] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
