from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Asistente de Licitaciones API"
    
    SUPABASE_URL: str
    SUPABASE_KEY: str

    QDRANT_URL: str
    QDRANT_API_KEY: str | None = None

    BACKEND_API_KEY: str

    # Azure Container Apps
    AZURE_TENANT_ID: str
    AZURE_CLIENT_ID: str
    AZURE_CLIENT_SECRET: str
    AZURE_SUBSCRIPTION_ID: str
    AZURE_RESOURCE_GROUP: str
    AZURE_CONTAINER_REGISTRY: str

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()
