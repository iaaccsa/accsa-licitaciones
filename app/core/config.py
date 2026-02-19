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

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()
