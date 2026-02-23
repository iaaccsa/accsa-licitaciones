import json
from openai import OpenAI
from google import genai
from qdrant_client import models

from app.core.config import get_settings
from app.core.qdrant import qdrant_client
from app.core.redis_client import redis_client

GEMINI_MODEL = "gemini-3-flash-preview"  # cambiar aquí para usar otro modelo


class ChatService:
    def __init__(self):
        self.settings = get_settings()
        self.openai_client = OpenAI(api_key=self.settings.OPENAI_API_KEY)

    def chat(self, message: str, analysis_slug: str, file_id: str) -> str:
        # 1. Cargar historial de Redis
        history_key = f"chat_history:{file_id}"
        raw_history = redis_client.lrange(history_key, 0, -1)
        history = [json.loads(item) for item in raw_history]
        last_20 = history[-20:]

        # 2. Generar embedding del mensaje del usuario
        embedding_response = self.openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=message
        )
        vector = embedding_response.data[0].embedding

        # 3. Buscar en Qdrant
        search_results = qdrant_client.query_points(
            collection_name=analysis_slug,
            query=vector,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="file_id",
                        match=models.MatchValue(value=file_id)
                    )
                ]
            ),
            limit=5,
            with_payload=True
        )
        chunks_text = "\n\n".join(
            hit.payload.get("text", "") for hit in search_results.points if hit.payload
        )

        # 4. Construir historial para Gemini
        # Gemini usa "model" en lugar de "assistant"
        history_for_llm = []
        for entry in last_20:
            role = "model" if entry["role"] == "assistant" else entry["role"]
            history_for_llm.append({
                "role": role,
                "parts": [{"text": entry["content"]}]
            })

        message_with_context = message
        if chunks_text:
            message_with_context = f"{message}\n\nContexto relevante:\n{chunks_text}"

        # 5. Llamar a Gemini
        gemini_client = genai.Client(api_key=self.settings.GEMINI_API_KEY)
        system_instruction = (
            "You are a specialized assistant for public procurement and tenders. "
            "Answer based on the provided context. "
            "Always format your response using Markdown: use headings, lists, bold text, "
            "and other elements when they improve readability. "
            "Always respond in Spanish, regardless of the language used in the user's message."
        )

        chat_session = gemini_client.chats.create(
            model=GEMINI_MODEL,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_instruction
            ),
            history=history_for_llm
        )
        response = chat_session.send_message(message_with_context)
        response_text = response.text

        # 6. Guardar en Redis
        redis_client.rpush(history_key, json.dumps({"role": "user", "content": message}))
        redis_client.rpush(history_key, json.dumps({"role": "assistant", "content": response_text}))

        return response_text

    def get_history(self, file_id: str, limit: int) -> list[dict]:
        capped_limit = min(limit, 20)
        history_key = f"chat_history:{file_id}"
        raw_history = redis_client.lrange(history_key, 0, -1)
        history = [json.loads(item) for item in raw_history]
        return history[-capped_limit:]


chat_service = ChatService()
