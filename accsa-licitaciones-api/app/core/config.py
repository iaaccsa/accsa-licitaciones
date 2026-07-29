from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Asistente de Licitaciones API"
    VERSION: str = "2.2.0"
    APP_ENV: str = "development"
    
    SUPABASE_URL: str
    SUPABASE_KEY: str

    QDRANT_URL: str
    QDRANT_API_KEY: str | None = None

    BACKEND_API_KEY: str

    OPENAI_API_KEY: str
    GEMINI_API_KEY: str
    UPSTASH_REDIS_REST_URL: str

    # Where pipeline jobs run: "azure" (Container Apps Jobs) or "local" (the
    # on-prem executor agent on VM2). The Azure path stays alive until the local
    # one has carried several real analyses.
    JOB_EXECUTOR: str = "azure"
    EXECUTOR_BASE_URL: str = ""
    EXECUTOR_API_KEY: str = ""

    # Azure Container Apps. Only required with JOB_EXECUTOR=azure, hence the
    # empty defaults: an on-prem deployment starts with none of them set.
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    AZURE_SUBSCRIPTION_ID: str = ""
    AZURE_RESOURCE_GROUP: str = ""
    AZURE_CONTAINER_REGISTRY: str = ""

    API_TENDER_CLASSIFICATIONS_PATH: str = "/api/v1/tender-classifications/"

    # Control plane injected into service jobs at launch (host config, not in DB).
    # Public URL of this API that jobs use for callbacks. Required, per-deployment
    # (never localhost in prod); no default so each environment sets its own.
    SERVICE_API_BASE_URL: str
    # Public Supabase Storage base for artifacts. Empty -> derived from SUPABASE_URL.
    SUPABASE_ARTIFACTS_BASE_URL: str = ""

    # With the local executor a step is 'running' from the moment the API queues
    # it, so this budget now includes the wait for a free slot, not just the run.
    JOB_TIMEOUT_MINUTES: int = 150
    JOB_MONITOR_INTERVAL_SECONDS: int = 60

    MAILGUN_API_KEY: str
    FRONTEND_BASE_URL: str = "https://accsa-licitaciones-ui.vercel.app"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()
