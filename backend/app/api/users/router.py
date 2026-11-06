from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Request, status

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.auth import ProfileUpdate, UserCreate, UserOut, UserUpdate
from app.schemas.common import ERROR_RESPONSES, Page
from app.services import auth_service, user_service

router = APIRouter(prefix="/users", tags=["Users"], responses=ERROR_RESPONSES)


@router.get("/me", response_model=UserOut, summary="Current user profile")
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut, summary="Update own profile or password")
def update_me(data: ProfileUpdate, user: CurrentUser, db: DB, request: Request) -> UserOut:
    return UserOut.model_validate(auth_service.update_profile(db, user, data, client_ip(request)))


@router.get("", response_model=Page[UserOut], summary="List users (company owner: own company; admin: all)")
def list_users(user: CurrentUser, db: DB, page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200)) -> Page[UserOut]:
    items, total = user_service.list_users(db, user, page, size)
    return Page[UserOut](items=[UserOut.model_validate(u) for u in items], total=total, page=page, size=size)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED, summary="Create a user")
def create_user(data: UserCreate, user: CurrentUser, db: DB, request: Request) -> UserOut:
    return UserOut.model_validate(user_service.create_user(db, user, data, client_ip(request)))


@router.get("/{user_id}", response_model=UserOut, summary="Get a user you are allowed to see")
def get_user(user_id: uuid.UUID, user: CurrentUser, db: DB) -> UserOut:
    return UserOut.model_validate(user_service.get_user(db, user, user_id))


@router.patch("/{user_id}", response_model=UserOut, summary="Update / deactivate a user")
def update_user(user_id: uuid.UUID, data: UserUpdate, user: CurrentUser, db: DB, request: Request) -> UserOut:
    return UserOut.model_validate(user_service.update_user(db, user, user_id, data, client_ip(request)))
