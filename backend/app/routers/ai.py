"""Read-only assistant. It explains the signed-in user's records and writes nothing."""

import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai_client import (
    DISCLAIMER,
    MISSING_KEY_MESSAGE,
    AIServiceError,
    AIUnavailable,
    complete,
)
from app.ai_context import financial_snapshot
from app.config import openai_settings
from app.database import get_db
from app.models import User
from app.routers.auth import get_current_user
from app.schemas import AIStatusResponse, ChatRequest, ChatResponse

router = APIRouter(prefix="/api/ai", tags=["ai"])

RATE_LIMIT = 8
WINDOW_SECONDS = 60
_requests = {}


def reset_rate_limits():
    _requests.clear()


def enforce_rate_limit(user_id):
    now = time.monotonic()
    recent = [stamp for stamp in _requests.get(user_id, []) if now - stamp < WINDOW_SECONDS]
    if len(recent) >= RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many assistant requests. Wait a minute and try again.",
        )
    recent.append(now)
    _requests[user_id] = recent


@router.get("/status", response_model=AIStatusResponse)
def ai_status(user: User = Depends(get_current_user)):
    """Say whether a key is configured. This does not call OpenAI or reveal the key."""
    del user
    if openai_settings()["api_key"]:
        return AIStatusResponse(
            available=True,
            message="The assistant can explain the records saved in your MoneyMap account.",
        )
    return AIStatusResponse(available=False, message=MISSING_KEY_MESSAGE)


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not openai_settings()["api_key"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=MISSING_KEY_MESSAGE)
    enforce_rate_limit(user.id)
    snapshot = financial_snapshot(db, user)
    history = [{"role": item.role, "content": item.content} for item in body.history]
    try:
        reply, model = complete(body.message, history, snapshot)
    except AIUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from None
    except AIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.public_message) from None
    return ChatResponse(reply=reply, model=model, disclaimer=DISCLAIMER)
