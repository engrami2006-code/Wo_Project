from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.ai.knowledge_base.loader import load_knowledge
from app.core.deps import DB, CurrentUser
from app.models import WeatherSnapshot
from app.schemas.common import ERROR_RESPONSES
from app.services import alert_service, weather_service
from app.services.access import Perm, get_farm

router = APIRouter(prefix="/weather", tags=["Weather (Open-Meteo, offline fallback)"], responses=ERROR_RESPONSES)


def _run(db, user, farm_id: uuid.UUID, force: bool) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    farm = get_farm(db, user, farm_id, Perm.FARM_READ)
    kb = load_knowledge(db)
    ws = weather_service.get_weather(db, farm, kb.params, force_refresh=force)
    alert_service.evaluate_weather_alerts(db, kb, farm, ws.status, ws.age_hours)
    db.commit()
    out = ws.to_dict()
    out["farm_id"] = str(farm.id)
    out["note"] = "relative_humidity_2m is AIR humidity at 2 m, not soil moisture."
    return out


@router.get("/{farm_id}", response_model=dict[str, Any], summary="Fresh weather if online, else the latest snapshot")
def get_weather(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> dict[str, Any]:
    return _run(db, user, farm_id, False)


@router.post("/{farm_id}/refresh", response_model=dict[str, Any], summary="Force a provider request")
def refresh(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> dict[str, Any]:
    return _run(db, user, farm_id, True)


@router.get("/{farm_id}/snapshots", response_model=list[dict[str, Any]], summary="Saved snapshots (newest first)")
def snapshots(farm_id: uuid.UUID, user: CurrentUser, db: DB, limit: int = Query(10, ge=1, le=100)) -> list[dict[str, Any]]:
    get_farm(db, user, farm_id)
    rows = db.scalars(select(WeatherSnapshot).where(WeatherSnapshot.farm_id == farm_id)
                      .order_by(WeatherSnapshot.fetched_at.desc()).limit(limit)).all()
    return [weather_service.snapshot_dict(s) for s in rows]
