"""FastAPI dependencies: database session, authenticated user, client IP."""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.models import User

bearer = HTTPBearer(auto_error=False, description="JWT access token from POST /api/auth/login")

DB = Annotated[Session, Depends(get_db)]


def get_current_user(db: DB,
                     credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Authentication required.")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(str(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise UnauthorizedError("Invalid or expired token.") from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active or int(payload.get("ver", -1)) != user.token_version:
        raise UnauthorizedError("Invalid or expired token.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
