from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class ServicePromptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    service: str
    filename: str
    title: str
    description: str
    body: str
    required_placeholders: List[str] = []
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    created_at: Optional[datetime] = None


class ServicePromptUpdate(BaseModel):
    body: str
    # Optional fields for seed/upsert (FASE 2). Ignored on a plain body edit.
    title: Optional[str] = None
    description: Optional[str] = None
    service: Optional[str] = None
    filename: Optional[str] = None
    required_placeholders: Optional[List[str]] = None
