from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class CandidateCrop(BaseModel):
    crop_id: uuid.UUID | None = Field(None, description="Use FAO-56 coefficients of this crop")
    name: str | None = Field(None, max_length=120)
    water_l_per_m2: float | None = Field(None, gt=0, description="Seasonal gross water per m² (overrides FAO-56)")
    yield_kg_per_m2: float = Field(..., gt=0, description="Expected yield per m² (user/agronomist input)")
    price_per_kg: float | None = Field(None, ge=0)
    min_area_m2: float = Field(0, ge=0)
    max_area_m2: float | None = Field(None, gt=0)
    min_production_kg: float | None = Field(None, ge=0)

    @model_validator(mode="after")
    def _identity(self) -> CandidateCrop:
        if self.crop_id is None and not self.name:
            raise ValueError("Provide crop_id or name")
        if self.crop_id is None and self.water_l_per_m2 is None:
            raise ValueError("Custom candidates need water_l_per_m2")
        return self


class LandRequest(BaseModel):
    farm_id: uuid.UUID | None = None
    total_area_m2: float = Field(..., gt=0)
    num_units: int = Field(20, ge=1, le=60, description="Land is divided into this many equal units")
    available_water_l: float = Field(..., gt=0, description="Water available for the season (L)")
    objective: Literal["max_production", "min_water"] = "max_production"
    use_value: bool = Field(False, description="Maximise value (price × yield) instead of kg")
    production_target_kg: float | None = Field(None, gt=0, description="Required for min_water")
    season_et0_mm_day: float | None = Field(None, gt=0, le=20,
                                            description="Mean ET0 for FAO-56 seasonal water")
    efficiency: float | None = Field(None, gt=0, le=1, description="Application efficiency for FAO-56 water")
    candidates: list[CandidateCrop] = Field(..., min_length=1, max_length=6)
    algorithms: list[Literal["astar", "ucs", "greedy", "bfs"]] = Field(
        default_factory=lambda: ["astar", "ucs", "greedy", "bfs"])

    @model_validator(mode="after")
    def _checks(self) -> LandRequest:
        if self.objective == "min_water" and self.production_target_kg is None:
            raise ValueError("production_target_kg is required for the min_water objective")
        if self.use_value and any(c.price_per_kg is None for c in self.candidates):
            raise ValueError("use_value requires price_per_kg for every candidate")
        return self


class LandResponse(BaseModel):
    request_id: uuid.UUID
    status: Literal["optimal", "infeasible", "limit_reached"]
    objective: str
    statement: str
    message: str
    allocation: list[dict[str, Any]]
    totals: dict[str, Any]
    binding_constraints: list[str]
    formulation: dict[str, Any]
    comparison: list[dict[str, Any]]
    created_at: datetime
