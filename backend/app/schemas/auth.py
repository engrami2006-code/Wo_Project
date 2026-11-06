from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.base import Role
from app.schemas.common import ORMModel


def _password_policy(value: str) -> str:
    if len(value) < 10:
        raise ValueError("Password must be at least 10 characters")
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must contain letters and digits")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)
    full_name: str = Field(..., min_length=2, max_length=200)
    account_type: Literal["individual", "company"] = "individual"
    company_name: str | None = Field(None, max_length=200)
    preferred_language: Literal["ar", "en"] = "ar"

    _pw = field_validator("password")(_password_policy)

    @model_validator(mode="after")
    def _company(self) -> RegisterRequest:
        if self.account_type == "company" and not (self.company_name or "").strip():
            raise ValueError("company_name is required for company accounts")
        return self

    model_config = {"json_schema_extra": {"examples": [{
        "email": "farmer@example.com", "password": "StrongPass123", "full_name": "Sara Ahmed",
        "account_type": "company", "company_name": "Green Valley Farms", "preferred_language": "ar"}]}}


class LoginRequest(BaseModel):
    # Plain string on purpose: accounts created by the admin CLI may use internal domains
    # (e.g. admin@wo.local) that strict e-mail validation rejects. Unknown e-mails fail as 401.
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+$")
    password: str = Field(..., max_length=128)


class CompanyOut(ORMModel):
    id: uuid.UUID
    name: str
    created_at: datetime


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    company_id: uuid.UUID | None
    is_active: bool
    preferred_language: str
    created_at: datetime
    last_login_at: datetime | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)
    full_name: str = Field(..., min_length=2, max_length=200)
    role: Literal["FARM_MANAGER", "EMPLOYEE", "COMPANY_OWNER", "INDIVIDUAL", "SUPER_ADMIN"]
    company_id: uuid.UUID | None = None
    preferred_language: Literal["ar", "en"] = "ar"

    _pw = field_validator("password")(_password_policy)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    is_active: bool | None = None
    role: Literal["FARM_MANAGER", "EMPLOYEE"] | None = None
    preferred_language: Literal["ar", "en"] | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    preferred_language: Literal["ar", "en"] | None = None
    current_password: str | None = None
    new_password: str | None = Field(None, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _new_pw(cls, v: str | None) -> str | None:
        return None if v is None else _password_policy(v)


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)


class CompanyUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
