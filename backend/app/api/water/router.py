from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Request, Response, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, client_ip
from app.models import WaterCalculation
from app.schemas.common import ERROR_RESPONSES, Page
from app.schemas.water import (
    BaselineCreate,
    BaselineOut,
    CalculationOut,
    CalculationRequest,
    CalculationResponse,
    ImpactReport,
    WaterAnalytics,
    WaterRecordCreate,
    WaterRecordOut,
)
from app.services import irrigation_service, water_service
from app.services.access import get_farm, visible_farm_ids

router = APIRouter(prefix="/water", tags=["Water management"], responses=ERROR_RESPONSES)


@router.get("/records", response_model=Page[WaterRecordOut], summary="Water records (filters + pagination)")
def list_records(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None, farm_crop_id: uuid.UUID | None = None,
                 date_from: date | None = None, date_to: date | None = None,
                 page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200)) -> Page[WaterRecordOut]:
    items, total = water_service.list_records(db, user, farm_id=farm_id, farm_crop_id=farm_crop_id,
                                              date_from=date_from, date_to=date_to, page=page, size=size)
    return Page[WaterRecordOut](items=[WaterRecordOut.model_validate(i) for i in items], total=total, page=page, size=size)


@router.post("/records", response_model=WaterRecordOut, status_code=status.HTTP_201_CREATED,
             summary="Record water use (triggers deterministic alert evaluation)")
def create_record(data: WaterRecordCreate, user: CurrentUser, db: DB, request: Request) -> WaterRecordOut:
    return WaterRecordOut.model_validate(water_service.create_record(db, user, data, client_ip(request)))


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a water record")
def delete_record(record_id: uuid.UUID, user: CurrentUser, db: DB, request: Request) -> Response:
    water_service.delete_record(db, user, record_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/analytics", response_model=WaterAnalytics, summary="Aggregates computed from real records only")
def analytics(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None,
              period: Literal["day", "week", "month", "year"] = "day",
              date_from: date | None = None, date_to: date | None = None) -> WaterAnalytics:
    return WaterAnalytics(**water_service.analytics(db, user, farm_id=farm_id, period=period,
                                                    date_from=date_from, date_to=date_to))


@router.post("/calculations", response_model=CalculationResponse,
             summary="FAO-56 water requirement for a planting (stored with inputs, parameters and steps)")
def calculate(req: CalculationRequest, user: CurrentUser, db: DB, request: Request) -> CalculationResponse:
    return CalculationResponse(**irrigation_service.calculate(db, user, req, client_ip(request)))


@router.get("/calculations", response_model=list[CalculationOut], summary="Calculation history")
def list_calculations(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None,
                      farm_crop_id: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=200)) -> list[CalculationOut]:
    ids = visible_farm_ids(db, user)
    if farm_id is not None:
        get_farm(db, user, farm_id)
        ids = [farm_id]
    q = select(WaterCalculation).where(WaterCalculation.farm_id.in_(ids))
    if farm_crop_id is not None:
        q = q.where(WaterCalculation.farm_crop_id == farm_crop_id)
    rows = db.scalars(q.order_by(WaterCalculation.created_at.desc()).limit(limit)).all()
    return [CalculationOut.model_validate(r) for r in rows]


@router.post("/baselines", response_model=BaselineOut, status_code=status.HTTP_201_CREATED,
             summary="Record a measured baseline period (required for measured savings)")
def create_baseline(data: BaselineCreate, user: CurrentUser, db: DB, request: Request) -> BaselineOut:
    return BaselineOut.model_validate(water_service.create_baseline(db, user, data, client_ip(request)))


@router.get("/baselines", response_model=list[BaselineOut], summary="Baselines of a farm")
def list_baselines(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> list[BaselineOut]:
    return [BaselineOut.model_validate(b) for b in water_service.list_baselines(db, user, farm_id)]


@router.get("/impact", response_model=ImpactReport, summary="Measured vs apparent savings (evidence-based)")
def impact(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> ImpactReport:
    r = water_service.impact(db, user, farm_id)
    r["baseline"] = BaselineOut.model_validate(r["baseline"]) if r["baseline"] else None
    return ImpactReport(**r)
