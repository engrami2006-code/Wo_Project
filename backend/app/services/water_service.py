"""Water records, analytics computed from real records only, baselines and impact."""

from __future__ import annotations

import statistics
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.knowledge_base.loader import load_knowledge
from app.core.errors import NotFoundError, ValidationAppError
from app.models import (
    Crop,
    Farm,
    FarmCrop,
    HydroponicSystem,
    User,
    WaterBaseline,
    WaterCalculation,
    WaterRecord,
)
from app.models.base import PlantingStatus, ensure_utc, utcnow
from app.schemas.water import BaselineCreate, WaterRecordCreate
from app.services import alert_service
from app.services.access import Perm, get_farm, visible_farm_ids
from app.services.audit import audit

# ----------------------------------------------------------------------------- records

def create_record(db: Session, user: User, data: WaterRecordCreate, ip: str | None) -> WaterRecord:
    farm = get_farm(db, user, data.farm_id, Perm.RECORD_CREATE)
    if data.farm_crop_id is not None:
        p = db.get(FarmCrop, data.farm_crop_id)
        if p is None or p.farm_id != farm.id:
            raise NotFoundError("Planting not found on this farm.")
    if data.hydroponic_system_id is not None:
        s = db.get(HydroponicSystem, data.hydroponic_system_id)
        if s is None or s.farm_id != farm.id:
            raise NotFoundError("Hydroponic system not found on this farm.")
    if ensure_utc(data.recorded_at) > utcnow() + timedelta(minutes=5):  # type: ignore[operator]
        raise ValidationAppError("A water record cannot be in the future.")
    rec = WaterRecord(**data.model_dump(), created_by_id=user.id)
    db.add(rec)
    db.flush()
    audit(db, user, "water_record.create", "water_record", rec.id,
          {"farm_id": str(farm.id), "volume_l": rec.volume_l}, ip)
    kb = load_knowledge(db)
    today = utcnow().date()
    alert_service.evaluate_usage_alerts(db, kb, farm, today)
    alert_service.evaluate_record_gaps(db, kb, farm, today)
    db.commit()
    db.refresh(rec)
    return rec


def list_records(db: Session, user: User, *, farm_id: uuid.UUID | None, farm_crop_id: uuid.UUID | None,
                 date_from: date | None, date_to: date | None, page: int, size: int) -> tuple[list[WaterRecord], int]:
    ids = visible_farm_ids(db, user)
    if farm_id is not None:
        get_farm(db, user, farm_id)
        ids = [farm_id]
    q = select(WaterRecord).where(WaterRecord.farm_id.in_(ids))
    if farm_crop_id is not None:
        q = q.where(WaterRecord.farm_crop_id == farm_crop_id)
    if date_from:
        q = q.where(WaterRecord.recorded_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(WaterRecord.recorded_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.order_by(WaterRecord.recorded_at.desc()).offset((page - 1) * size).limit(size)).all()
    return list(items), total


def delete_record(db: Session, user: User, record_id: uuid.UUID, ip: str | None) -> None:
    rec = db.get(WaterRecord, record_id)
    if rec is None:
        raise NotFoundError("Water record not found.")
    get_farm(db, user, rec.farm_id, Perm.RECORD_DELETE)
    audit(db, user, "water_record.delete", "water_record", rec.id, {"volume_l": rec.volume_l}, ip)
    db.delete(rec)
    db.commit()


# ----------------------------------------------------------------------------- analytics

def period_key(d: date, period: str) -> str:
    if period == "day":
        return d.isoformat()
    if period == "week":
        y, w, _ = d.isocalendar()
        return f"{y}-W{w:02d}"
    if period == "month":
        return f"{d.year}-{d.month:02d}"
    return str(d.year)


def analytics(db: Session, user: User, *, farm_id: uuid.UUID | None, period: str,
              date_from: date | None, date_to: date | None) -> dict[str, Any]:
    kb = load_knowledge(db)
    min_days = int(kb.params["min_history_days"])
    ids = visible_farm_ids(db, user)
    if farm_id is not None:
        get_farm(db, user, farm_id)
        ids = [farm_id]
    q = (select(WaterRecord, FarmCrop.area_m2, Crop.name_en, Crop.name_ar, Farm.name)
         .join(Farm, Farm.id == WaterRecord.farm_id)
         .outerjoin(FarmCrop, FarmCrop.id == WaterRecord.farm_crop_id)
         .outerjoin(Crop, Crop.id == FarmCrop.crop_id)
         .where(WaterRecord.farm_id.in_(ids)))
    if date_from:
        q = q.where(WaterRecord.recorded_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(WaterRecord.recorded_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    rows = db.execute(q).all()
    empty = {"farm_id": farm_id, "period": period, "has_data": False, "sufficient_history": False,
             "message": "No water records yet.", "days_with_records": 0, "total_l": None,
             "average_per_period_l": None, "min_period_l": None, "max_period_l": None, "trend_pct": None,
             "l_per_m2": None, "series": [], "by_farm": [], "by_crop": [], "by_source": [], "anomalies": []}
    if not rows:
        return empty

    series: dict[str, dict[str, float]] = defaultdict(lambda: {"total": 0.0, "n": 0})
    daily: dict[date, float] = defaultdict(float)
    by_farm: dict[str, float] = defaultdict(float)
    by_crop: dict[str, dict[str, Any]] = {}
    by_source: dict[str, float] = defaultdict(float)
    total = 0.0
    for rec, _area, crop_en, crop_ar, farm_name in rows:
        d = ensure_utc(rec.recorded_at).date()  # type: ignore[union-attr]
        k = period_key(d, period)
        series[k]["total"] += rec.volume_l
        series[k]["n"] += 1
        daily[d] += rec.volume_l
        by_farm[farm_name] += rec.volume_l
        label = crop_en or ("Hydroponics" if rec.hydroponic_system_id else "Unassigned")
        label_ar = crop_ar or ("الزراعة المائية" if rec.hydroponic_system_id else "غير مخصص")
        by_crop.setdefault(label, {"name_en": label, "name_ar": label_ar, "total_l": 0.0})
        by_crop[label]["total_l"] += rec.volume_l
        by_source[rec.source.value] += rec.volume_l
        total += rec.volume_l

    keys = sorted(series)
    values = [series[k]["total"] for k in keys]
    days_with = len(daily)
    sufficient = days_with >= min_days
    result = dict(empty)
    result.update({
        "has_data": True, "sufficient_history": sufficient, "days_with_records": days_with,
        "total_l": round(total, 2),
        "series": [{"period": k, "total_l": round(series[k]["total"], 2), "records": int(series[k]["n"])}
                   for k in keys],
        "by_farm": [{"farm": f, "total_l": round(v, 2)} for f, v in sorted(by_farm.items(), key=lambda x: -x[1])],
        "by_crop": [{**v, "total_l": round(v["total_l"], 2)} for v in
                    sorted(by_crop.values(), key=lambda x: -x["total_l"])],
        "by_source": [{"source": s, "total_l": round(v, 2)} for s, v in sorted(by_source.items(), key=lambda x: -x[1])],
        "message": None if sufficient else
        f"Statistics need at least {min_days} days with records ({days_with} so far).",
    })
    if sufficient:
        result.update({
            "average_per_period_l": round(statistics.mean(values), 2),
            "min_period_l": round(min(values), 2), "max_period_l": round(max(values), 2),
            "trend_pct": (round((values[-1] - values[-2]) / values[-2] * 100, 1)
                          if len(values) >= 2 and values[-2] > 0 else None),
        })
        # deterministic anomaly rule: day > factor × trailing median of the previous days
        factor = float(kb.params["usage_spike_factor"])
        ordered = sorted(daily)
        anomalies = []
        for i, d in enumerate(ordered):
            prev = [daily[x] for x in ordered[max(0, i - 30):i]]
            if len(prev) >= min_days:
                med = statistics.median(prev)
                if med > 0 and daily[d] > factor * med:
                    anomalies.append({"date": d.isoformat(), "total_l": round(daily[d], 2),
                                      "median_l": round(med, 2), "factor": factor, "rule": "R-ALR-003"})
        result["anomalies"] = anomalies
    # water per m² over the plantings of the selected scope (active area)
    area = db.scalar(select(func.sum(FarmCrop.area_m2)).where(FarmCrop.farm_id.in_(ids),
                                                              FarmCrop.status == PlantingStatus.ACTIVE))
    irrigation_total = sum(r[0].volume_l for r in rows if r[0].farm_crop_id is not None)
    if area and irrigation_total > 0:
        result["l_per_m2"] = round(irrigation_total / float(area), 3)
    return result


# ----------------------------------------------------------------------------- baselines & impact

def create_baseline(db: Session, user: User, data: BaselineCreate, ip: str | None) -> WaterBaseline:
    farm = get_farm(db, user, data.farm_id, Perm.FARM_UPDATE)
    if data.farm_crop_id is not None:
        p = db.get(FarmCrop, data.farm_crop_id)
        if p is None or p.farm_id != farm.id:
            raise NotFoundError("Planting not found on this farm.")
    row = WaterBaseline(**data.model_dump(), created_by_id=user.id)
    db.add(row)
    db.flush()
    audit(db, user, "baseline.create", "water_baseline", row.id, {"farm_id": str(farm.id)}, ip)
    db.commit()
    db.refresh(row)
    return row


def list_baselines(db: Session, user: User, farm_id: uuid.UUID) -> list[WaterBaseline]:
    get_farm(db, user, farm_id)
    return list(db.scalars(select(WaterBaseline).where(WaterBaseline.farm_id == farm_id)
                           .order_by(WaterBaseline.created_at.desc())))


def impact(db: Session, user: User, farm_id: uuid.UUID) -> dict[str, Any]:
    get_farm(db, user, farm_id)
    kb = load_knowledge(db)
    min_days = int(kb.params["min_history_days"])
    today = utcnow().date()
    baseline = db.scalar(select(WaterBaseline).where(WaterBaseline.farm_id == farm_id)
                         .order_by(WaterBaseline.created_at.desc()).limit(1))
    report: dict[str, Any] = {
        "farm_id": farm_id, "baseline": baseline, "baseline_l_per_m2_day": None, "current_l_per_m2_day": None,
        "current_days": 0, "measured_savings_pct": None,
        "measured_savings_note": "Not available — record a measured baseline period first.",
        "calculated_requirement_l": None, "actual_usage_l": None, "apparent_savings_l": None,
        "apparent_savings_note": ("Apparent savings compare the calculated requirement with recorded use. "
                                  "They may reflect under-irrigation or unrecorded use and are NOT proof of "
                                  "real savings."),
    }
    window = 30
    if baseline is not None:
        bdays = (baseline.period_end - baseline.period_start).days + 1
        report["baseline_l_per_m2_day"] = round(baseline.total_volume_l / baseline.area_m2 / bdays, 4)
        window = max(min_days, min(bdays, 90))
    start = today - timedelta(days=window - 1)
    q = select(WaterRecord).where(WaterRecord.farm_id == farm_id,
                                  WaterRecord.recorded_at >= datetime.combine(start, datetime.min.time()),
                                  WaterRecord.farm_crop_id.is_not(None))
    if baseline is not None and baseline.farm_crop_id is not None:
        q = q.where(WaterRecord.farm_crop_id == baseline.farm_crop_id)
    records = db.scalars(q).all()
    days = {ensure_utc(r.recorded_at).date() for r in records}  # type: ignore[union-attr]
    report["current_days"] = len(days)
    actual = sum(r.volume_l for r in records)
    if baseline is not None:
        area = baseline.area_m2
        if len(days) >= min_days:
            current = actual / area / window
            report["current_l_per_m2_day"] = round(current, 4)
            base = report["baseline_l_per_m2_day"]
            if base and base > 0:
                report["measured_savings_pct"] = round((base - current) / base * 100, 1)
                report["measured_savings_note"] = (
                    f"Measured: baseline {base:.3f} vs current {current:.3f} L/m²/day over the last "
                    f"{window} days. Weather and crop stage differences between periods are not normalised.")
        else:
            report["measured_savings_note"] = (f"Needs at least {min_days} days with records in the current "
                                               f"window ({len(days)} so far).")
    # apparent savings: latest calculation per planting per day vs recorded use on those days
    calcs = db.scalars(select(WaterCalculation).where(WaterCalculation.farm_id == farm_id,
                                                      WaterCalculation.target_date >= start)
                       .order_by(WaterCalculation.created_at)).all()
    latest: dict[tuple[str, date], float] = {}
    for c in calcs:
        g = c.result.get("gross_l")
        if g is not None and c.farm_crop_id is not None:
            latest[(str(c.farm_crop_id), c.target_date)] = float(g)
    if latest:
        req_total = sum(latest.values())
        used = sum(r.volume_l for r in records
                   if (str(r.farm_crop_id), ensure_utc(r.recorded_at).date()) in latest)  # type: ignore[union-attr]
        report["calculated_requirement_l"] = round(req_total, 2)
        report["actual_usage_l"] = round(used, 2)
        if used > 0:
            report["apparent_savings_l"] = round(req_total - used, 2)
    return report
