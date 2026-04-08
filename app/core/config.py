from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Asistente de Licitaciones API"
    APP_ENV: str = "development"
    
    SUPABASE_URL: str
    SUPABASE_KEY: str

    QDRANT_URL: str
    QDRANT_API_KEY: str | None = None

    BACKEND_API_KEY: str

    OPENAI_API_KEY: str
    GEMINI_API_KEY: str
    UPSTASH_REDIS_REST_URL: str

    # Azure Container Apps
    AZURE_TENANT_ID: str
    AZURE_CLIENT_ID: str
    AZURE_CLIENT_SECRET: str
    AZURE_SUBSCRIPTION_ID: str
    AZURE_RESOURCE_GROUP: str
    AZURE_CONTAINER_REGISTRY: str

    API_TENDER_CLASSIFICATIONS_PATH: str = "/api/v1/tender-classifications/"

    JOB_TIMEOUT_MINUTES: int = 35
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
