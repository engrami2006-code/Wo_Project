from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.schemas.common import ERROR_RESPONSES, Message
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"], responses=ERROR_RESPONSES)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED,
             summary="Create an individual or company account and sign in")
def register(data: RegisterRequest, db: DB, request: Request) -> TokenResponse:
    ip = client_ip(request)
    auth_service.register(db, data, ip)
    token, expires, user = auth_service.login(db, data.email, data.password, ip)
    return TokenResponse(access_token=token, expires_in=expires, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse, summary="Sign in with e-mail and password")
def login(data: LoginRequest, db: DB, request: Request) -> TokenResponse:
    token, expires, user = auth_service.login(db, data.email, data.password, client_ip(request))
    return TokenResponse(access_token=token, expires_in=expires, user=UserOut.model_validate(user))


@router.post("/logout", response_model=Message, summary="Revoke all tokens of the current user")
def logout(user: CurrentUser, db: DB, request: Request) -> Message:
    auth_service.logout(db, user, client_ip(request))
    return Message(message="Signed out.")
