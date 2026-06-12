from fastapi import APIRouter, HTTPException

from app.schemas.app_setting import LlmConfig, LlmConfigRead
from app.services.app_settings_service import app_settings_service

router = APIRouter()


@router.get("/llm-config", response_model=LlmConfigRead)
def get_llm_config():
    try:
        return app_settings_service.get_llm_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/llm-config", response_model=LlmConfigRead)
def update_llm_config(config: LlmConfig):
    try:
        return app_settings_service.update_llm_config(config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
