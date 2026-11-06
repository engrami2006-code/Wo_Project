"""Dashboard summary — every number is computed from the database; empty states otherwise."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.knowledge_base.loader import load_knowledge
from app.models import (
    Alert,
    Crop,
    Farm,
    FarmCrop,
    HydroponicRecord,
    HydroponicSystem,
    Recommendation,
    User,
    WaterRecord,
    WeatherSnapshot,
)
from app.models.base import AlertStatus, PlantingStatus, SystemStatus, ensure_utc, utcnow
from app.services.access import visible_farm_ids


def dashboard(db: Session, user: User) -> dict[str, Any]:
    kb = load_knowledge(db)
    ids = visible_farm_ids(db, user)
    now = utcnow()
    today = now.date()
    if not ids:
        return {"empty": True, "farms": 0, "message": "Your farm workspace is empty. Add your first farm to begin.",
                "generated_at": now}

    farms = db.scalars(select(Farm).where(Farm.id.in_(ids))).all()
    plantings = db.scalars(select(FarmCrop).where(FarmCrop.farm_id.in_(ids),
                                                  FarmCrop.status == PlantingStatus.ACTIVE)).all()
    systems = db.scalars(select(HydroponicSystem).where(HydroponicSystem.farm_id.in_(ids))).all()

    # water: last 30 days vs the previous 30
    since = datetime.combine(today - timedelta(days=59), datetime.min.time())
    rows = db.execute(select(WaterRecord.recorded_at, WaterRecord.volume_l, WaterRecord.record_type)
                      .where(WaterRecord.farm_id.in_(ids), WaterRecord.recorded_at >= since)).all()
    daily: dict[str, float] = defaultdict(float)
    cur = prev = 0.0
    hydro_l = 0.0
    for ts, vol, rtype in rows:
        d = ensure_utc(ts).date()  # type: ignore[union-attr]
        if d > today - timedelta(days=30):
            cur += vol
            daily[d.isoformat()] += vol
            if rtype.value == "hydroponic":
                hydro_l += vol
        else:
            prev += vol
    min_days = int(kb.params["min_history_days"])
    days_with = len(daily)
    water = {"last_30_days_l": round(cur, 2) if rows else None, "previous_30_days_l": round(prev, 2) if prev else None,
             "trend_pct": round((cur - prev) / prev * 100, 1) if prev > 0 and days_with >= min_days else None,
             "days_with_records": days_with, "hydroponic_l": round(hydro_l, 2) if rows else None,
             "series": [{"date": (today - timedelta(days=29 - i)).isoformat(),
                         "total_l": round(daily.get((today - timedelta(days=29 - i)).isoformat(), 0.0), 2)}
                        for i in range(30)] if daily else []}
    area = sum(p.area_m2 for p in plantings)
    irrigation_cur = sum(v for ts, v, t in rows if t.value == "irrigation"
                         and ensure_utc(ts).date() > today - timedelta(days=30))  # type: ignore[union-attr]
    water["l_per_m2_30d"] = round(irrigation_cur / area, 3) if area and irrigation_cur else None

    # crop distribution (area)
    dist: dict[str, dict[str, Any]] = {}
    for p in plantings:
        key = p.crop.code
        dist.setdefault(key, {"code": key, "name_en": p.crop.name_en, "name_ar": p.crop.name_ar, "area_m2": 0.0})
        dist[key]["area_m2"] += p.area_m2

    # alerts
    open_alerts = db.scalars(select(Alert).where(Alert.farm_id.in_(ids), Alert.status == AlertStatus.OPEN)
                             .order_by(Alert.created_at.desc())).all()
    by_sev: dict[str, int] = defaultdict(int)
    for a in open_alerts:
        by_sev[a.severity.value] += 1

    recs = db.scalars(select(Recommendation).where(Recommendation.farm_id.in_(ids))
                      .order_by(Recommendation.created_at.desc()).limit(6)).all()
    action_counts = dict(db.execute(select(Recommendation.action, func.count())
                                    .where(Recommendation.farm_id.in_(ids), Recommendation.kind == "irrigation",
                                           Recommendation.created_at >= now - timedelta(days=30))
                                    .group_by(Recommendation.action)).all())

    weather = []
    stale_h = float(kb.params["stale_weather_hours"])
    for f in farms:
        snap = db.scalar(select(WeatherSnapshot).where(WeatherSnapshot.farm_id == f.id)
                         .order_by(WeatherSnapshot.fetched_at.desc()).limit(1))
        if snap is None:
            weather.append({"farm_id": f.id, "farm": f.name, "status": "unavailable", "age_hours": None})
        else:
            age = (now - ensure_utc(snap.fetched_at)).total_seconds() / 3600  # type: ignore[operator]
            today_i = snap.daily.get("time", []).index(today.isoformat()) if today.isoformat() in snap.daily.get("time", []) else None
            weather.append({"farm_id": f.id, "farm": f.name, "status": "stale" if age > stale_h else "recent",
                            "age_hours": round(age, 1), "current": snap.current,
                            "et0_today": snap.daily.get("et0_fao_evapotranspiration", [None] * 9)[today_i]
                            if today_i is not None else None,
                            "rain_today": snap.daily.get("precipitation_sum", [None] * 9)[today_i]
                            if today_i is not None else None})

    hydro = []
    for s in systems:
        last = db.scalar(select(HydroponicRecord).where(HydroponicRecord.system_id == s.id)
                         .order_by(HydroponicRecord.recorded_at.desc()).limit(1))
        in_range = None
        if last is not None and None not in (s.ph_min, s.ph_max, s.ec_min, s.ec_max) and last.ph is not None \
                and last.ec is not None:
            in_range = s.ph_min <= last.ph <= s.ph_max and s.ec_min <= last.ec <= s.ec_max  # type: ignore[operator]
        hydro.append({"id": s.id, "name": s.name, "type": s.system_type.value, "status": s.status.value,
                      "plant_count": s.plant_count, "reservoir_capacity_l": s.reservoir_capacity_l,
                      "last_ph": last.ph if last else None, "last_ec": last.ec if last else None,
                      "last_record_at": last.recorded_at if last else None, "in_range": in_range})

    return {
        "empty": False, "generated_at": now,
        "counts": {"farms": len(farms), "active_plantings": len(plantings),
                   "hydroponic_systems": len(systems),
                   "active_hydroponic_systems": sum(1 for s in systems if s.status == SystemStatus.ACTIVE),
                   "cultivated_area_m2": round(area, 2), "open_alerts": len(open_alerts)},
        "water": water,
        "crop_distribution": sorted(dist.values(), key=lambda x: -x["area_m2"]),
        "alerts": {"by_severity": dict(by_sev),
                   "latest": [{"id": a.id, "severity": a.severity.value, "title_en": a.title_en, "title_ar": a.title_ar,
                               "message_en": a.message_en, "message_ar": a.message_ar, "rule_code": a.rule_code,
                               "created_at": a.created_at} for a in open_alerts[:5]]},
        "recommendations": [{"id": r.id, "kind": r.kind, "action": r.action, "title_en": r.title_en,
                             "title_ar": r.title_ar, "summary_en": r.summary_en, "summary_ar": r.summary_ar,
                             "amount_l": r.amount_l, "created_at": r.created_at} for r in recs],
        "irrigation_actions_30d": action_counts,
        "weather": weather,
        "hydroponics": hydro,
        "farms": [{"id": f.id, "name": f.name, "latitude": f.latitude, "longitude": f.longitude,
                   "is_demo": f.is_demo} for f in farms],
        "crops_count": db.scalar(select(func.count()).select_from(Crop).where(Crop.is_reference.is_(True))),
    }
