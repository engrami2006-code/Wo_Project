from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.base import GrowthStage, PlantingStatus, WaterSource
from app.schemas.common import ORMModel


class FarmBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    location_name: str | None = Field(None, max_length=200)
    total_area_m2: float | None = Field(None, gt=0)
    water_source: WaterSource | None = None
    daily_water_allowance_l: float | None = Field(None, ge=0, description="Water available per day (L)")
    notes: str | None = Field(None, max_length=5000)


class FarmCreate(FarmBase):
    company_id: uuid.UUID | None = Field(None, description="Only SUPER_ADMIN may set this explicitly")


class FarmUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    location_name: str | None = Field(None, max_length=200)
    total_area_m2: float | None = Field(None, gt=0)
    water_source: WaterSource | None = None
    daily_water_allowance_l: float | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=5000)


class FarmOut(ORMModel):
    id: uuid.UUID
    name: str
    company_id: uuid.UUID | None
    owner_user_id: uuid.UUID | None
    latitude: float
    longitude: float
    location_name: str | None
    total_area_m2: float | None
    water_source: str | None
    daily_water_allowance_l: float | None
    notes: str | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime


class FarmSummary(FarmOut):
    plantings_count: int = 0
    hydro_systems_count: int = 0
    open_alerts: int = 0


class MemberCreate(BaseModel):
    user_id: uuid.UUID


class MemberOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    role: str


class CropOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_ar: str
    aliases: list[str]
    category: str
    kc_ini: float
    kc_mid: float
    kc_end: float
    l_ini: int | None
    l_dev: int | None
    l_mid: int | None
    l_late: int | None
    max_height_m: float | None
    ky: float | None
    is_perennial: bool
    source: str
    source_note: str | None
    is_reference: bool
    season_length_days: int | None = None


class CropCreate(BaseModel):
    code: str = Field(..., pattern=r"^[a-z][a-z0-9_]{1,63}$")
    name_en: str = Field(..., min_length=1, max_length=120)
    name_ar: str = Field(..., min_length=1, max_length=120)
    aliases: list[str] = Field(default_factory=list, max_length=20)
    category: str = Field("custom", max_length=64)
    kc_ini: float = Field(..., ge=0, le=2)
    kc_mid: float = Field(..., ge=0, le=2)
    kc_end: float = Field(..., ge=0, le=2)
    l_ini: int | None = Field(None, ge=1, le=400)
    l_dev: int | None = Field(None, ge=1, le=400)
    l_mid: int | None = Field(None, ge=1, le=400)
    l_late: int | None = Field(None, ge=1, le=400)
    max_height_m: float | None = Field(None, gt=0, le=40)
    ky: float | None = Field(None, gt=0, le=3)
    is_perennial: bool = False
    source: str = Field(..., min_length=3, max_length=300, description="Where the coefficients come from")
    source_note: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _stages(self) -> CropCreate:
        parts = [self.l_ini, self.l_dev, self.l_mid, self.l_late]
        if any(p is not None for p in parts) and any(p is None for p in parts):
            raise ValueError("Provide all four stage lengths or none")
        if all(p is None for p in parts) and not self.is_perennial:
            raise ValueError("Annual crops need the four FAO-56 stage lengths")
        return self


class IrrigationMethodOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_ar: str
    efficiency: float
    source: str
    source_note: str | None


class PlantingCreate(BaseModel):
    crop_id: uuid.UUID
    variety: str | None = Field(None, max_length=120)
    area_m2: float = Field(..., gt=0)
    planting_date: date | None = None
    soil_type: str | None = Field(None, max_length=32)
    irrigation_method_id: uuid.UUID | None = None
    irrigation_efficiency: float | None = Field(None, gt=0, le=1)
    stage_override: GrowthStage | None = None
    notes: str | None = Field(None, max_length=5000)


class PlantingUpdate(BaseModel):
    variety: str | None = Field(None, max_length=120)
    area_m2: float | None = Field(None, gt=0)
    planting_date: date | None = None
    soil_type: str | None = Field(None, max_length=32)
    irrigation_method_id: uuid.UUID | None = None
    irrigation_efficiency: float | None = Field(None, gt=0, le=1)
    stage_override: GrowthStage | None = None
    status: PlantingStatus | None = None
    notes: str | None = Field(None, max_length=5000)
    clear_stage_override: bool = False


class PlantingOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    crop_id: uuid.UUID
    crop: CropOut
    variety: str | None
    area_m2: float
    planting_date: date | None
    soil_type: str | None
    irrigation_method_id: uuid.UUID | None
    irrigation_method: IrrigationMethodOut | None
    irrigation_efficiency: float | None
    stage_override: GrowthStage | None
    status: PlantingStatus
    notes: str | None
    created_at: datetime
    current_stage: dict[str, Any] | None = None
