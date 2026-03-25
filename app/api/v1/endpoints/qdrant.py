from fastapi import APIRouter, HTTPException
from app.schemas.qdrant import QdrantSearchRequest, QdrantSearchResponse, QdrantScrollRequest, QdrantScrollResponse, QdrantCreateCollectionRequest, QdrantCreateCollectionResponse
from app.services.qdrant_service import qdrant_service
from typing import Any

router = APIRouter()

@router.get("/collections")
def list_collections():
    """
    List all collections in Qdrant.
    """
    try:
        return qdrant_service.list_collections()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collections", response_model=QdrantCreateCollectionResponse)
def create_collection(params: QdrantCreateCollectionRequest):
    """
    Create a new collection in Qdrant.
    """
    try:
        return qdrant_service.create_collection(params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search", response_model=QdrantSearchResponse)
def search_vectors(search_params: QdrantSearchRequest):
    """
    Search for similar vectors in a specific collection.
    """
    try:
        return qdrant_service.search_points(search_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/points/search", response_model=QdrantScrollResponse)
def scroll_points(scroll_params: QdrantScrollRequest):
    """
    Scroll points in a specific collection with filters.
    """
    # print(f"Scroll Params: {scroll_params}")
    try:
        return qdrant_service.scroll_points(scroll_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
