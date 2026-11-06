from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.base import HydroSystemType, SystemStatus
from app.schemas.common import ORMModel


class _Ranges(BaseModel):
    ph_min: float | None = Field(None, ge=0, le=14)
    ph_max: float | None = Field(None, ge=0, le=14)
    ec_min: float | None = Field(None, ge=0, le=20, description="mS/cm")
    ec_max: float | None = Field(None, ge=0, le=20, description="mS/cm")

    @model_validator(mode="after")
    def _order(self):  # type: ignore[no-untyped-def]
        if self.ph_min is not None and self.ph_max is not None and self.ph_min >= self.ph_max:
            raise ValueError("ph_min must be lower than ph_max")
        if self.ec_min is not None and self.ec_max is not None and self.ec_min >= self.ec_max:
            raise ValueError("ec_min must be lower than ec_max")
        return self


class HydroSystemCreate(_Ranges):
    farm_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=160)
    system_type: HydroSystemType
    crop_id: uuid.UUID | None = None
    growing_area_m2: float = Field(..., gt=0)
    plant_count: int = Field(0, ge=0)
    reservoir_capacity_l: float = Field(..., gt=0)
    is_closed_loop: bool = True
    status: SystemStatus = SystemStatus.ACTIVE
    threshold_source: str | None = Field(None, max_length=300)
    profile_code: str | None = Field(None, description="Apply ranges from a reference profile")
    notes: str | None = Field(None, max_length=5000)


class HydroSystemUpdate(_Ranges):
    name: str | None = Field(None, min_length=1, max_length=160)
    system_type: HydroSystemType | None = None
    crop_id: uuid.UUID | None = None
    growing_area_m2: float | None = Field(None, gt=0)
    plant_count: int | None = Field(None, ge=0)
    reservoir_capacity_l: float | None = Field(None, gt=0)
    is_closed_loop: bool | None = None
    status: SystemStatus | None = None
    threshold_source: str | None = Field(None, max_length=300)
    profile_code: str | None = None
    notes: str | None = Field(None, max_length=5000)


class HydroSystemOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    name: str
    system_type: HydroSystemType
    crop_id: uuid.UUID | None
    growing_area_m2: float
    plant_count: int
    reservoir_capacity_l: float
    is_closed_loop: bool
    status: SystemStatus
    ph_min: float | None
    ph_max: float | None
    ec_min: float | None
    ec_max: float | None
    threshold_source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    latest_record: dict[str, Any] | None = None
    records_count: int = 0


class HydroRecordCreate(BaseModel):
    recorded_at: datetime
    period_days: float = Field(1.0, gt=0, le=31)
    water_input_l: float = Field(..., ge=0)
    water_consumed_l: float | None = Field(None, ge=0)
    water_recycled_l: float | None = Field(None, ge=0)
    water_discharged_l: float | None = Field(None, ge=0)
    water_losses_l: float | None = Field(None, ge=0)
    reservoir_start_l: float | None = Field(None, ge=0)
    reservoir_end_l: float | None = Field(None, ge=0)
    ph: float | None = Field(None, ge=0, le=14)
    ec: float | None = Field(None, ge=0, le=20)
    water_temp_c: float | None = Field(None, ge=-5, le=60)
    notes: str | None = Field(None, max_length=2000)


class HydroRecordOut(ORMModel):
    id: uuid.UUID
    system_id: uuid.UUID
    recorded_at: datetime
    period_days: float
    water_input_l: float
    water_consumed_l: float | None
    water_recycled_l: float | None
    water_discharged_l: float | None
    water_losses_l: float | None
    reservoir_start_l: float | None
    reservoir_end_l: float | None
    ph: float | None
    ec: float | None
    water_temp_c: float | None
    notes: str | None
    created_at: datetime


class HydroProfileOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_ar: str
    crop_code: str | None
    ph_min: float | None
    ph_max: float | None
    ec_min: float | None
    ec_max: float | None
    source: str
    source_note: str | None


class HydroRecordResult(BaseModel):
    record: HydroRecordOut
    balance: dict[str, Any]
    evaluation: dict[str, Any]
    alerts_created: int
