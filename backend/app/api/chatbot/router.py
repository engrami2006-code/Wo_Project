from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
from app.schemas.ai import ChatMessageOut, ChatQuery, ChatReply
from app.schemas.common import ERROR_RESPONSES
from app.services import chatbot_service

router = APIRouter(prefix="/chatbot", tags=["Chatbot (deterministic, KB-backed)"], responses=ERROR_RESPONSES)


@router.post("/query", response_model=ChatReply,
             summary="Ask the WO assistant (pattern NLU → backward/forward chaining → templates)")
def query(data: ChatQuery, user: CurrentUser, db: DB) -> ChatReply:
    svc = chatbot_service.ChatbotService(db, user)
    manual = {k: v for k, v in {"et0_override_mm": data.et0_override_mm,
                                "precipitation_override_mm": data.precipitation_override_mm,
                                "available_water_l": data.available_water_l}.items() if v is not None}
    return ChatReply(**svc.handle(data.message, data.session_id, data.language, manual))


@router.get("/sessions/{session_id}", response_model=list[ChatMessageOut], summary="Conversation history")
def session(session_id: uuid.UUID, user: CurrentUser, db: DB) -> list[ChatMessageOut]:
    return [ChatMessageOut.model_validate(m) for m in chatbot_service.history(db, user, session_id)]
