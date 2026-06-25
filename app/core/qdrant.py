from qdrant_client import QdrantClient
from app.core.config import get_settings
from app.services.infra_config_service import infra_config_service

settings = get_settings()

# Single source: resolve provider creds from Vault, fall back to Settings during
# the transition (and if Vault is unreachable at startup).
try:
    _provider = infra_config_service.get_runtime_env()
except Exception:
    _provider = {}

qdrant_client = QdrantClient(
    url=_provider.get("QDRANT_URL") or settings.QDRANT_URL,
    api_key=_provider.get("QDRANT_API_KEY") or settings.QDRANT_API_KEY,
)

def verify_qdrant_connection():
    try:
        qdrant_client.get_collections()
        return True
    except Exception:
        return False
