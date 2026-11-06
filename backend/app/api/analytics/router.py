from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
from app.schemas.common import ERROR_RESPONSES
from app.services import analytics_service, hydro_service, water_service

router = APIRouter(tags=["Dashboard & analytics"], responses=ERROR_RESPONSES)


@router.get("/dashboard/summary", response_model=dict[str, Any], summary="Dashboard widgets (real data only)")
def summary(user: CurrentUser, db: DB) -> dict[str, Any]:
    return analytics_service.dashboard(db, user)


@router.get("/analytics/overview", response_model=dict[str, Any],
            summary="Monthly water analytics plus hydroponic water totals")
def overview(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None) -> dict[str, Any]:
    water = water_service.analytics(db, user, farm_id=farm_id, period="month", date_from=None, date_to=None)
    hydro = []
    for s in hydro_service.list_systems(db, user, farm_id):
        rep = hydro_service.balance_report(db, user, s["id"])
        hydro.append({"id": str(s["id"]), "name": s["name"], "type": s["system_type"].value,
                      "plant_count": s["plant_count"], "totals": rep["totals"], "has_data": rep["has_data"]})
    return {"water": water, "hydroponics": hydro}
