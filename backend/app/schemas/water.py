from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.models.base import WaterRecordType, WaterSource
from app.schemas.common import ORMModel


class WaterRecordCreate(BaseModel):
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None = None
    hydroponic_system_id: uuid.UUID | None = None
    recorded_at: datetime
    volume_l: float = Field(..., ge=0, le=1e9)
    source: WaterSource
    record_type: WaterRecordType = WaterRecordType.IRRIGATION
    notes: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _target(self) -> WaterRecordCreate:
        if self.farm_crop_id and self.hydroponic_system_id:
            raise ValueError("A record targets either a planting or a hydroponic system, not both")
        return self


class WaterRecordOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None
    hydroponic_system_id: uuid.UUID | None
    recorded_at: datetime
    volume_l: float
    source: WaterSource
    record_type: WaterRecordType
    notes: str | None
    is_demo: bool
    created_at: datetime


class CalculationRequest(BaseModel):
    farm_crop_id: uuid.UUID
    target_date: date | None = None
    et0_override_mm: float | None = Field(None, ge=0, le=30)
    precipitation_override_mm: float | None = Field(None, ge=0, le=1000)


class CalculationOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None
    target_date: date
    method: str
    inputs: dict[str, Any]
    parameters: dict[str, Any]
    steps: list[Any]
    result: dict[str, Any]
    weather_snapshot_id: uuid.UUID | None
    created_at: datetime


class CalculationResponse(BaseModel):
    calculation: CalculationOut | None
    status: Literal["calculated", "insufficient_data"]
    missing_data: list[str]
    message: str


class BaselineCreate(BaseModel):
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None = None
    period_start: date
    period_end: date
    total_volume_l: float = Field(..., ge=0)
    area_m2: float = Field(..., gt=0)
    notes: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _order(self) -> BaselineCreate:
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class BaselineOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    farm_crop_id: uuid.UUID | None
    period_start: date
    period_end: date
    total_volume_l: float
    area_m2: float
    notes: str | None
    created_at: datetime


class SeriesPoint(BaseModel):
    period: str
    total_l: float
    records: int


class WaterAnalytics(BaseModel):
    farm_id: uuid.UUID | None
    period: str
    has_data: bool
    sufficient_history: bool
    message: str | None
    days_with_records: int
    total_l: float | None
    average_per_period_l: float | None
    min_period_l: float | None
    max_period_l: float | None
    trend_pct: float | None
    l_per_m2: float | None
    series: list[SeriesPoint]
    by_farm: list[dict[str, Any]]
    by_crop: list[dict[str, Any]]
    by_source: list[dict[str, Any]]
    anomalies: list[dict[str, Any]]


class ImpactReport(BaseModel):
    farm_id: uuid.UUID
    baseline: BaselineOut | None
    baseline_l_per_m2_day: float | None
    current_l_per_m2_day: float | None
    current_days: int
    measured_savings_pct: float | None
    measured_savings_note: str
    calculated_requirement_l: float | None
    actual_usage_l: float | None
    apparent_savings_l: float | None
    apparent_savings_note: str
