from typing import List, Optional

from app.repositories.service_prompt_repository import service_prompt_repository
from app.schemas.service_prompt import ServicePromptRead, ServicePromptUpdate


class PromptNotFoundError(Exception):
    def __init__(self, key: str):
        self.key = key
        super().__init__(f"prompt not found: {key}")


class PlaceholderValidationError(Exception):
    def __init__(self, missing: List[str]):
        self.missing = missing
        super().__init__(f"missing required placeholders: {missing}")


class ServicePromptService:
    def __init__(self):
        self.repository = service_prompt_repository

    def list_prompts(self) -> List[ServicePromptRead]:
        return [ServicePromptRead(**row) for row in self.repository.list_all()]

    def get_prompt(self, key: str) -> ServicePromptRead:
        row = self.repository.get_by_key(key)
        if not row:
            raise PromptNotFoundError(key)
        return ServicePromptRead(**row)

    def update_prompt(self, key: str, body: str, updated_by: Optional[str]) -> ServicePromptRead:
        row = self.repository.get_by_key(key)
        if not row:
            raise PromptNotFoundError(key)

        missing = [
            p for p in (row.get("required_placeholders") or [])
            if "{" + p + "}" not in body
        ]
        if missing:
            raise PlaceholderValidationError(missing)

        updated = self.repository.update_by_key(key, {"body": body, "updated_by": updated_by})
        return ServicePromptRead(**updated)

    def seed_prompt(self, key: str, payload: ServicePromptUpdate) -> ServicePromptRead:
        data = payload.model_dump(exclude_none=True)
        updated = self.repository.upsert(key, data)
        return ServicePromptRead(**updated)


service_prompt_service = ServicePromptService()
