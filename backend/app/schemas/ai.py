from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.base import AlertSeverity, AlertStatus, RecommendationStatus
from app.schemas.common import ORMModel


class IrrigationRequest(BaseModel):
    farm_crop_id: uuid.UUID
    target_date: date | None = None
    available_water_l: float | None = Field(None, ge=0, description="Overrides the farm's daily allowance")
    et0_override_mm: float | None = Field(None, ge=0, le=30, description="Manual ET0 (offline mode)")
    precipitation_override_mm: float | None = Field(None, ge=0, le=1000)
    persist: bool = True


class RecommendationOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None
    hydroponic_system_id: uuid.UUID | None
    kind: str
    action: str
    title_en: str
    title_ar: str
    summary_en: str
    summary_ar: str
    amount_l: float | None
    target_date: date | None
    certainty: str
    data_quality: str
    status: RecommendationStatus
    created_at: datetime
    payload: dict[str, Any] | None = None


class IrrigationResponse(BaseModel):
    status: Literal["recommendation", "insufficient_data"]
    recommendation_id: uuid.UUID | None
    explanation: dict[str, Any]
    weather_status: str
    alerts_created: int


class RecommendationStatusUpdate(BaseModel):
    status: RecommendationStatus


class ScheduleTaskIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    farm_crop_id: uuid.UUID | None = None
    volume_l: float = Field(..., gt=0)
    flow_lph: float = Field(..., gt=0, description="Line flow rate (L/h)")


class TimeRange(BaseModel):
    start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end: str = Field(..., pattern=r"^\d{2}:\d{2}$")


class ScheduleRequest(BaseModel):
    farm_id: uuid.UUID | None = None
    slot_minutes: Literal[15, 30, 60] = 30
    window_start: str = Field("05:00", pattern=r"^\d{2}:\d{2}$")
    window_end: str = Field("21:00", pattern=r"^\d{2}:\d{2}$")
    blocked: list[TimeRange] = Field(default_factory=list)
    pump_capacity_lph: float = Field(..., gt=0)
    daily_limit_l: float | None = Field(None, gt=0)
    tasks: list[ScheduleTaskIn] = Field(..., min_length=1, max_length=30)


class ScheduleResponse(BaseModel):
    status: str
    message: str
    violated: str | None
    schedule: list[dict[str, Any]]
    load_profile: list[dict[str, Any]]
    stats: dict[str, Any]
    formulation: dict[str, Any]


class ChatQuery(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    session_id: uuid.UUID | None = None
    language: Literal["ar", "en"] | None = None
    et0_override_mm: float | None = Field(None, ge=0, le=30, description="Manual ET0 when weather is offline")
    precipitation_override_mm: float | None = Field(None, ge=0, le=1000)
    available_water_l: float | None = Field(None, ge=0)


class ChatReply(BaseModel):
    session_id: uuid.UUID
    intent: str | None
    language: str
    text: str
    status: Literal["answer", "clarification", "missing_data", "fallback"]
    options: list[dict[str, Any]] = Field(default_factory=list)
    explanation: dict[str, Any] | None = None
    nlu: dict[str, Any] = Field(default_factory=dict)


class ChatMessageOut(ORMModel):
    id: uuid.UUID
    role: str
    text: str
    payload: dict[str, Any]
    created_at: datetime


class AlertOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None
    hydroponic_system_id: uuid.UUID | None
    rule_code: str
    symbol: str
    severity: AlertSeverity
    title_en: str
    title_ar: str
    message_en: str
    message_ar: str
    evidence: dict[str, Any]
    status: AlertStatus
    created_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    resolved_reason: str | None


class AlertUpdate(BaseModel):
    status: Literal["acknowledged", "resolved"]


class FactOut(ORMModel):
    id: uuid.UUID
    key: str
    value: Any
    unit: str | None
    kind: str
    category: str
    description_en: str
    description_ar: str
    source: str | None
    version: int
    is_active: bool
    updated_at: datetime


class FactUpdate(BaseModel):
    value: Any
    source: str | None = Field(None, max_length=400)


class RuleOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_ar: str
    category: str
    antecedent: str
    consequent: str
    action_group: str | None
    priority: int
    severity: str | None
    recommendation_en: str | None
    recommendation_ar: str | None
    explanation_en: str
    explanation_ar: str
    source: str | None
    version: int
    is_active: bool
    updated_at: datetime


class RuleIn(BaseModel):
    code: str = Field(..., pattern=r"^R-[A-Z]{3}-\d{3}$")
    name_en: str = Field(..., min_length=2, max_length=200)
    name_ar: str = Field(..., min_length=2, max_length=200)
    category: Literal["irrigation", "decision", "advisory", "alert", "hydroponics"]
    antecedent: str = Field(..., min_length=1, max_length=1000)
    consequent: str = Field(..., min_length=1, max_length=120)
    action_group: str | None = Field(None, max_length=64)
    priority: int = Field(50, ge=0, le=1000)
    severity: Literal["info", "warning", "critical"] | None = None
    recommendation_en: str | None = Field(None, max_length=2000)
    recommendation_ar: str | None = Field(None, max_length=2000)
    explanation_en: str = Field(..., min_length=2, max_length=2000)
    explanation_ar: str = Field(..., min_length=2, max_length=2000)
    source: str | None = Field(None, max_length=400)
    is_active: bool = True


class RuleUpdate(BaseModel):
    name_en: str | None = Field(None, min_length=2, max_length=200)
    name_ar: str | None = Field(None, min_length=2, max_length=200)
    antecedent: str | None = Field(None, min_length=1, max_length=1000)
    consequent: str | None = Field(None, min_length=1, max_length=120)
    action_group: str | None = Field(None, max_length=64)
    priority: int | None = Field(None, ge=0, le=1000)
    severity: Literal["info", "warning", "critical"] | None = None
    recommendation_en: str | None = Field(None, max_length=2000)
    recommendation_ar: str | None = Field(None, max_length=2000)
    explanation_en: str | None = Field(None, min_length=2, max_length=2000)
    explanation_ar: str | None = Field(None, min_length=2, max_length=2000)
    source: str | None = Field(None, max_length=400)
    is_active: bool | None = None


class RuleHistoryOut(ORMModel):
    id: uuid.UUID
    rule_code: str
    version: int
    change_type: str
    snapshot: dict[str, Any]
    changed_by_id: uuid.UUID | None
    changed_at: datetime


class PerceptOut(ORMModel):
    symbol: str
    category: str
    description_en: str
    description_ar: str
    depends_on: list[str]
    threshold_key: str | None


class LogicAskRequest(BaseModel):
    facts: dict[str, bool] = Field(default_factory=dict, description="Percept truth values (TELL)")
    query: str = Field(..., min_length=1, max_length=500, description="Propositional sentence (ASK)")
    categories: list[str] = Field(default_factory=lambda: ["irrigation", "decision", "advisory", "alert"])
    include_axioms: bool = False

    @field_validator("facts")
    @classmethod
    def _limit(cls, v: dict[str, bool]) -> dict[str, bool]:
        if len(v) > 60:
            raise ValueError("Too many facts")
        return v


class ValidationRequest(BaseModel):
    candidate: RuleIn | None = Field(None, description="Validate the KB as if this rule were added/updated")
