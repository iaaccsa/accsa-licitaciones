from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.service_prompt import ServicePromptRead, ServicePromptUpdate
from app.services.service_prompt_service import (
    service_prompt_service,
    PromptNotFoundError,
    PlaceholderValidationError,
)
from app.core.audit import Actor, get_actor
from app.services.audit_service import audit_service

router = APIRouter()


@router.get("", response_model=List[ServicePromptRead])
def list_prompts():
    try:
        return service_prompt_service.list_prompts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{key:path}", response_model=ServicePromptRead)
def get_prompt(key: str):
    try:
        return service_prompt_service.get_prompt(key)
    except PromptNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{key:path}", response_model=ServicePromptRead)
def update_prompt(key: str, payload: ServicePromptUpdate, actor: Actor = Depends(get_actor)):
    # Seed mode (FASE 2): the seed script sends the full card metadata to
    # create/replace rows. A plain admin edit sends only `body`.
    is_seed = payload.service is not None and payload.title is not None
    if is_seed:
        try:
            return service_prompt_service.seed_prompt(key, payload)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    try:
        result = service_prompt_service.update_prompt(
            key, payload.body, updated_by=actor.user_email or actor.user_id
        )
        audit_service.log(
            "prompt.update", actor,
            resource_type="service_prompt",
            details={"key": key},
        )
        return result
    except PromptNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PlaceholderValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={"message": "missing required placeholders", "missing": e.missing},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
