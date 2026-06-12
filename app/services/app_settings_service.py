from app.repositories.app_settings_repository import app_settings_repository
from app.schemas.app_setting import LlmConfig, LlmConfigRead

LLM_CONFIG_KEY = "llm_config"


class AppSettingsService:
    def __init__(self):
        self.repository = app_settings_repository

    def get_llm_config(self) -> LlmConfigRead:
        row = self.repository.get_by_key(LLM_CONFIG_KEY)
        if not row:
            # Defaults if the row does not exist (same behavior as before)
            return LlmConfigRead(primary_model="openai", intelligence_level="medium")
        return LlmConfigRead(**row["value"], updated_at=row.get("updated_at"))

    def update_llm_config(self, config: LlmConfig) -> LlmConfigRead:
        row = self.repository.upsert_value(LLM_CONFIG_KEY, config.model_dump())
        return LlmConfigRead(**row["value"], updated_at=row.get("updated_at"))


app_settings_service = AppSettingsService()
