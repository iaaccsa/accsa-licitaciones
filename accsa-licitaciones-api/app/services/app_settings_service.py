from app.repositories.app_settings_repository import app_settings_repository
from app.schemas.app_setting import (
    LlmConfig,
    LlmConfigRead,
    LlmConfigUpdate,
    HitlConfig,
    HitlConfigRead,
    NotificationsConfig,
    NotificationsConfigRead,
)

LLM_CONFIG_KEY = "llm_config"
HITL_CONFIG_KEY = "hitl_config"
NOTIFICATIONS_CONFIG_KEY = "notifications_config"


class AppSettingsService:
    def __init__(self):
        self.repository = app_settings_repository

    def get_llm_config(self) -> LlmConfigRead:
        row = self.repository.get_by_key(LLM_CONFIG_KEY)
        if not row:
            # Defaults if the row does not exist (same behavior as before)
            return LlmConfigRead(primary_model="openai", intelligence_level="medium")
        return LlmConfigRead(**row["value"], updated_at=row.get("updated_at"))

    def update_llm_config(self, update: LlmConfigUpdate) -> LlmConfigRead:
        # Patch, not replace: the admin view only edits the reasoning of each
        # model, and primary_model/intelligence_level still feed model_tiers.
        current = self.get_llm_config()
        merged = LlmConfig(
            **{**current.model_dump(exclude={"updated_at"}), **update.model_dump()}
        )
        row = self.repository.upsert_value(LLM_CONFIG_KEY, merged.model_dump(mode="json"))
        return LlmConfigRead(**row["value"], updated_at=row.get("updated_at"))

    def get_hitl_config(self) -> HitlConfigRead:
        row = self.repository.get_by_key(HITL_CONFIG_KEY)
        if not row:
            return HitlConfigRead(hitl=False)
        return HitlConfigRead(**row["value"], updated_at=row.get("updated_at"))

    def update_hitl_config(self, config: HitlConfig) -> HitlConfigRead:
        row = self.repository.upsert_value(HITL_CONFIG_KEY, config.model_dump())
        return HitlConfigRead(**row["value"], updated_at=row.get("updated_at"))

    def get_notifications_config(self) -> NotificationsConfigRead:
        row = self.repository.get_by_key(NOTIFICATIONS_CONFIG_KEY)
        if not row:
            return NotificationsConfigRead(email_enabled=True)
        return NotificationsConfigRead(**row["value"], updated_at=row.get("updated_at"))

    def update_notifications_config(self, config: NotificationsConfig) -> NotificationsConfigRead:
        row = self.repository.upsert_value(NOTIFICATIONS_CONFIG_KEY, config.model_dump())
        return NotificationsConfigRead(**row["value"], updated_at=row.get("updated_at"))


app_settings_service = AppSettingsService()
