from fastapi import APIRouter, HTTPException, Depends

from app.schemas.app_setting import (
    LlmConfig,
    LlmConfigRead,
    HitlConfig,
    HitlConfigRead,
    NotificationsConfig,
    NotificationsConfigRead,
    InfraConfigStatus,
    InfraConfigUpdate,
)
from app.services.app_settings_service import app_settings_service
from app.services.infra_config_service import infra_config_service
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


@router.get("/hitl", response_model=HitlConfigRead)
def get_hitl_config():
    try:
        return app_settings_service.get_hitl_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/hitl", response_model=HitlConfigRead)
def update_hitl_config(config: HitlConfig, actor: Actor = Depends(get_actor)):
    try:
        result = app_settings_service.update_hitl_config(config)
        audit_service.log(
            "hitl_config.update", actor,
            resource_type="app_setting",
            details=config.model_dump(mode="json"),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications", response_model=NotificationsConfigRead)
def get_notifications_config():
    try:
        return app_settings_service.get_notifications_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/notifications", response_model=NotificationsConfigRead)
def update_notifications_config(config: NotificationsConfig, actor: Actor = Depends(get_actor)):
    try:
        result = app_settings_service.update_notifications_config(config)
        audit_service.log(
            "notifications_config.update", actor,
            resource_type="app_setting",
            details=config.model_dump(mode="json"),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/infra-config", response_model=InfraConfigStatus)
def get_infra_config():
    try:
        return infra_config_service.get_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/infra-config", response_model=InfraConfigStatus)
def update_infra_config(config: InfraConfigUpdate, actor: Actor = Depends(get_actor)):
    try:
        values = config.model_dump()
        changed_keys = [k for k, v in values.items() if v]
        result = infra_config_service.set_values(values)
        audit_service.log(
            "infra_config.update", actor,
            resource_type="app_setting",
            details={"keys": changed_keys},  # names only, never values
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
