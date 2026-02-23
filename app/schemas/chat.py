from typing import List

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    analysis_slug: str
    file_id: str


class ChatResponse(BaseModel):
    response: str


class ChatMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatHistoryRequest(BaseModel):
    file_id: str
    limit: int = 20     # nunca supera 20


class ChatHistoryResponse(BaseModel):
    messages: List[ChatMessage]
