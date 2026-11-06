from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class Message(BaseModel):
    message: str


class Pagination(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=200)


ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Authentication required or token invalid"},
    403: {"model": ErrorResponse, "description": "Authenticated but not permitted"},
    404: {"model": ErrorResponse, "description": "Resource not found or not visible to you"},
    422: {"model": ErrorResponse, "description": "Validation error"},
}
