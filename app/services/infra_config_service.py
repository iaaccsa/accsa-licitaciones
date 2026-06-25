import logging
import threading
import time
from typing import Dict, Optional

from app.core.supabase import supabase

logger = logging.getLogger(__name__)

# env var name (consumed by service jobs) -> vault secret name
PROVIDER_ENV_TO_SECRET = {
    "QDRANT_URL": "infra.qdrant_url",
    "QDRANT_API_KEY": "infra.qdrant_api_key",
    "OPENAI_API_KEY": "infra.openai_api_key",
    "GOOGLE_API_KEY": "infra.google_api_key",
    "MISTRAL_API_KEY": "infra.mistral_api_key",
}

# UI / PUT field name -> vault secret name
FIELD_TO_SECRET = {
    "qdrant_url": "infra.qdrant_url",
    "qdrant_api_key": "infra.qdrant_api_key",
    "openai_api_key": "infra.openai_api_key",
    "google_api_key": "infra.google_api_key",
    "mistral_api_key": "infra.mistral_api_key",
}

_CACHE_TTL_SECONDS = 60


class InfraConfigService:
    """Provider-plane credentials stored encrypted in Supabase Vault. Read via
    SECURITY DEFINER RPCs (the `vault` schema is not exposed through PostgREST)."""

    def __init__(self):
        self._cache: Optional[Dict[str, str]] = None
        self._cache_ts: float = 0.0
        self._lock = threading.Lock()

    def _read_secrets(self) -> Dict[str, str]:
        """vault secret name -> decrypted value (only infra.*)."""
        resp = supabase.rpc("infra_config_get").execute()
        return {row["name"]: (row["value"] or "") for row in (resp.data or [])}

    def get_runtime_env(self) -> Dict[str, str]:
        """env var name -> provider value ('' if unset). Cached with short TTL so
        large fan-outs don't hit Vault once per job."""
        now = time.monotonic()
        with self._lock:
            if self._cache is not None and (now - self._cache_ts) < _CACHE_TTL_SECONDS:
                return dict(self._cache)

        secrets = self._read_secrets()
        env = {
            env_name: secrets.get(secret_name, "")
            for env_name, secret_name in PROVIDER_ENV_TO_SECRET.items()
        }
        with self._lock:
            self._cache = env
            self._cache_ts = time.monotonic()
        return dict(env)

    def get_status(self) -> Dict[str, dict]:
        """field name -> {set: bool, updated_at}. Never exposes secret values."""
        resp = supabase.rpc("infra_config_status").execute()
        by_secret = {row["name"]: row for row in (resp.data or [])}
        status: Dict[str, dict] = {}
        for field, secret_name in FIELD_TO_SECRET.items():
            row = by_secret.get(secret_name)
            status[field] = {
                "set": bool(row["is_set"]) if row else False,
                "updated_at": row.get("updated_at") if row else None,
            }
        return status

    def set_values(self, values: Dict[str, Optional[str]]) -> Dict[str, dict]:
        """Upsert provided fields. Empty/None = leave unchanged (write-only, no delete)."""
        for field, value in values.items():
            if value is None or value == "":
                continue
            secret_name = FIELD_TO_SECRET.get(field)
            if not secret_name:
                continue
            supabase.rpc("infra_config_set", {"p_name": secret_name, "p_value": value}).execute()
        self.invalidate_cache()
        return self.get_status()

    def invalidate_cache(self) -> None:
        with self._lock:
            self._cache = None
            self._cache_ts = 0.0


infra_config_service = InfraConfigService()
