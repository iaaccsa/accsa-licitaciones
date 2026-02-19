from qdrant_client import QdrantClient
from app.core.config import get_settings

settings = get_settings()

qdrant_client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY
)

def verify_qdrant_connection():
    try:
        qdrant_client.get_collections()
        return True
    except Exception:
        return False
