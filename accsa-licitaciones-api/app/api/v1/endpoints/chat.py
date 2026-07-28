from fastapi import APIRouter, HTTPException, status
from app.schemas.chat import ChatHistoryRequest, ChatHistoryResponse, ChatMessage, ChatRequest, ChatResponse
from app.services.chat_service import chat_service

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        response_text = chat_service.chat(
            message=request.message,
            analysis_slug=request.analysis_slug,
            file_id=request.file_id
        )
        return ChatResponse(response=response_text)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/history", response_model=ChatHistoryResponse)
async def get_chat_history(request: ChatHistoryRequest):
    try:
        messages = chat_service.get_history(
            file_id=request.file_id,
            limit=request.limit
        )
        return ChatHistoryResponse(messages=[ChatMessage(**m) for m in messages])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
