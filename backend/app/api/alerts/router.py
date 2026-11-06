from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Query, Request

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.ai import AlertOut, AlertUpdate
from app.schemas.common import ERROR_RESPONSES, Page
from app.services import alert_service

router = APIRouter(prefix="/alerts", tags=["Alerts"], responses=ERROR_RESPONSES)


@router.get("", response_model=Page[AlertOut], summary="Explainable alerts")
def list_alerts(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None,
                status: Literal["open", "acknowledged", "resolved"] | None = None,
                severity: Literal["info", "warning", "critical"] | None = None,
                page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200)) -> Page[AlertOut]:
    items, total = alert_service.list_alerts(db, user, farm_id=farm_id, status=status, severity=severity,
                                             page=page, size=size)
    return Page[AlertOut](items=[AlertOut.model_validate(a) for a in items], total=total, page=page, size=size)


@router.patch("/{alert_id}", response_model=AlertOut, summary="Acknowledge or resolve an alert")
def update_alert(alert_id: uuid.UUID, data: AlertUpdate, user: CurrentUser, db: DB, request: Request) -> AlertOut:
    return AlertOut.model_validate(alert_service.update_alert(db, user, alert_id, data.status, client_ip(request)))


@router.post("/evaluate", response_model=dict[str, int], summary="Run the alert rules for a farm now")
def evaluate(farm_id: uuid.UUID, user: CurrentUser, db: DB, request: Request) -> dict[str, int]:
    return alert_service.evaluate_farm(db, user, farm_id, client_ip(request))
