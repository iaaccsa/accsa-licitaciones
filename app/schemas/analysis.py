from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class AnalysisBase(BaseModel):
    status: str
    slug: str
    artifact_path: str
    is_success: Optional[bool] = None

class Analysis(AnalysisBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AnalysisStatusUpdate(BaseModel):
    status: str
