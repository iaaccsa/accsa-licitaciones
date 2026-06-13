from fastapi import APIRouter, HTTPException, Depends

from app.schemas.app_setting import LlmConfig, LlmConfigRead
from app.services.app_settings_service import app_settings_service
from app.core.audit import Actor, get_actor
from app.services.audit_service import audit_service

router = APIRouter()


@router.get("/llm-config", response_model=LlmConfigRead)
def get_llm_config():
    try:
        return app_settings_service.get_llm_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/llm-config", response_model=LlmConfigRead)
def update_llm_config(config: LlmConfig, actor: Actor = Depends(get_actor)):
    try:
        result = app_settings_service.update_llm_config(config)
        audit_service.log(
            "llm_config.update", actor,
            resource_type="app_setting",
            details=config.model_dump(mode="json"),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
