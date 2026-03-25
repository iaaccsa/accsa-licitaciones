from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional

class QdrantSearchRequest(BaseModel):
    collection_name: str
    vector: List[float]
    filter: Optional[Dict[str, Any]] = None
    limit: int = 20
    with_payload: bool = True

class QdrantScrollRequest(BaseModel):
    slug: str
    category: Optional[str] = None
    label: Optional[str] = None
    offset: Optional[str] = None
    limit: int = 20

    @field_validator('limit')
    @classmethod
    def max_limit_is_20(cls, v: int) -> int:
        if v > 20:
            return 20
        return v

class QdrantPoint(BaseModel):
    id: Any
    score: Optional[float] = None
    payload: Optional[Dict[str, Any]] = None

class QdrantSearchResponse(BaseModel):
    points: List[QdrantPoint]

class QdrantScrollResponse(BaseModel):
    points: List[QdrantPoint]
    next_page_offset: Optional[Any] = None

class QdrantCreateCollectionRequest(BaseModel):
    collection_name: str
    vector_size: int
    distance: str = "Cosine"

    @field_validator('distance')
    @classmethod
    def validate_distance(cls, v: str) -> str:
        allowed = {"Cosine", "Euclid", "Dot"}
        if v not in allowed:
            raise ValueError(f"distance must be one of {allowed}")
        return v

class QdrantCreateCollectionResponse(BaseModel):
    collection_name: str
    status: str
