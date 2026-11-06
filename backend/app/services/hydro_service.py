"""Hydroponics: systems, measured water balance, configured ranges and KB evaluation."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agronomy.hydro_balance import BalanceResult, compute_balance
from app.ai.agent import HYDRO_CATEGORIES, HYDRO_PRIMARY, KBAgent
from app.ai.knowledge_base.loader import load_knowledge
from app.ai.perception.hydroponics import HydroRecordView, HydroSystemView, perceive_hydroponics
from app.core.errors import NotFoundError, ValidationAppError
from app.models import (
    Farm,
    HydroponicProfile,
    HydroponicRecord,
    HydroponicSystem,
    Recommendation,
    User,
    WaterRecord,
)
from app.models.base import SystemStatus, WaterRecordType, WaterSource, ensure_utc, utcnow
from app.schemas.hydro import HydroRecordCreate, HydroSystemCreate, HydroSystemUpdate
from app.services import alert_service
from app.services.access import Perm, get_farm, get_system, visible_farm_ids
from app.services.audit import audit


def _apply_profile(db: Session, system: HydroponicSystem, code: str | None) -> None:
    if not code:
        return
    profile = db.scalar(select(HydroponicProfile).where(HydroponicProfile.code == code))
    if profile is None:
        raise NotFoundError("Reference profile not found.")
    system.ph_min, system.ph_max = profile.ph_min, profile.ph_max
    system.ec_min, system.ec_max = profile.ec_min, profile.ec_max
    system.threshold_source = profile.source


def record_dict(r: HydroponicRecord | None) -> dict[str, Any] | None:
    if r is None:
        return None
    return {c.name: getattr(r, c.name) for c in HydroponicRecord.__table__.columns}


def system_out(db: Session, s: HydroponicSystem) -> dict[str, Any]:
    d = {c.name: getattr(s, c.name) for c in HydroponicSystem.__table__.columns}
    latest = db.scalar(select(HydroponicRecord).where(HydroponicRecord.system_id == s.id)
                       .order_by(HydroponicRecord.recorded_at.desc()).limit(1))
    d["latest_record"] = record_dict(latest)
    d["records_count"] = db.scalar(select(func.count()).select_from(HydroponicRecord)
                                   .where(HydroponicRecord.system_id == s.id)) or 0
    return d


def list_systems(db: Session, user: User, farm_id: uuid.UUID | None) -> list[dict[str, Any]]:
    ids = visible_farm_ids(db, user)
    if farm_id is not None:
        get_farm(db, user, farm_id)
        ids = [farm_id]
    systems = db.scalars(select(HydroponicSystem).where(HydroponicSystem.farm_id.in_(ids))
                         .order_by(HydroponicSystem.created_at.desc())).all()
    return [system_out(db, s) for s in systems]


def create_system(db: Session, user: User, data: HydroSystemCreate, ip: str | None) -> HydroponicSystem:
    get_farm(db, user, data.farm_id, Perm.FARM_UPDATE)
    payload = data.model_dump(exclude={"profile_code"})
    system = HydroponicSystem(**payload)
    _apply_profile(db, system, data.profile_code)
    db.add(system)
    db.flush()
    audit(db, user, "hydro_system.create", "hydroponic_system", system.id, {"type": system.system_type.value}, ip)
    db.commit()
    db.refresh(system)
    return system


def update_system(db: Session, user: User, system_id: uuid.UUID, data: HydroSystemUpdate,
                  ip: str | None) -> HydroponicSystem:
    system = get_system(db, user, system_id, Perm.FARM_UPDATE)
    changes = data.model_dump(exclude_unset=True, exclude={"profile_code"})
    for k, v in changes.items():
        setattr(system, k, v)
    _apply_profile(db, system, data.profile_code)
    for lo, hi in (("ph_min", "ph_max"), ("ec_min", "ec_max")):
        a, b = getattr(system, lo), getattr(system, hi)
        if a is not None and b is not None and a >= b:
            raise ValidationAppError(f"{lo} must be lower than {hi}")
    audit(db, user, "hydro_system.update", "hydroponic_system", system.id, {"fields": sorted(changes)}, ip)
    db.commit()
    db.refresh(system)
    return system


def delete_system(db: Session, user: User, system_id: uuid.UUID, ip: str | None) -> None:
    system = get_system(db, user, system_id, Perm.FARM_DELETE)
    audit(db, user, "hydro_system.delete", "hydroponic_system", system.id, {}, ip)
    db.delete(system)
    db.commit()


def balance_for(system: HydroponicSystem, r: HydroponicRecord) -> BalanceResult:
    return compute_balance(input_l=r.water_input_l, consumed_l=r.water_consumed_l, recycled_l=r.water_recycled_l,
                           discharged_l=r.water_discharged_l, losses_l=r.water_losses_l,
                           reservoir_start_l=r.reservoir_start_l, reservoir_end_l=r.reservoir_end_l,
                           period_days=r.period_days, plant_count=system.plant_count,
                           area_m2=system.growing_area_m2)


def evaluate_system(db: Session, system: HydroponicSystem) -> dict[str, Any]:
    kb = load_knowledge(db)
    records = db.scalars(select(HydroponicRecord).where(HydroponicRecord.system_id == system.id)
                         .order_by(HydroponicRecord.recorded_at)).all()
    views = [HydroRecordView(ensure_utc(r.recorded_at), r.ph, r.ec, r.water_discharged_l,  # type: ignore[arg-type]
                             r.water_input_l / r.period_days) for r in records]
    latest = records[-1] if records else None
    sv = HydroSystemView(system.name, system.is_closed_loop, system.ph_min, system.ph_max, system.ec_min,
                         system.ec_max, system.threshold_source, system.status == SystemStatus.ACTIVE)
    perception = perceive_hydroponics(sv, views[-1] if views else None,
                                      balance_for(system, latest) if latest else None, views, utcnow(),
                                      kb.params)
    agent = KBAgent(kb, HYDRO_CATEGORIES)
    cycle = agent.run_cycle(perception.percepts, perception.variables, primary_symbols=HYDRO_PRIMARY,
                            goals=["hydro_status_ok"], data_quality="measured")
    expl = cycle.explanation
    expl["context"] = {"system_id": str(system.id), "system_name": system.name, "farm_id": str(system.farm_id)}
    return expl


def add_record(db: Session, user: User, system_id: uuid.UUID, data: HydroRecordCreate, ip: str | None) -> dict[str, Any]:
    system = get_system(db, user, system_id, Perm.RECORD_CREATE)
    if ensure_utc(data.recorded_at) > utcnow() + timedelta(minutes=5):  # type: ignore[operator]
        raise ValidationAppError("A record cannot be in the future.")
    if data.reservoir_end_l is not None and data.reservoir_end_l > system.reservoir_capacity_l * 1.05:
        raise ValidationAppError("Reservoir level exceeds the configured capacity.")
    rec = HydroponicRecord(system_id=system.id, **data.model_dump(), created_by_id=user.id, created_at=utcnow())
    db.add(rec)
    db.flush()
    farm = db.get(Farm, system.farm_id)
    # Integration with water management: the input volume is real water use for the farm.
    db.add(WaterRecord(farm_id=system.farm_id, hydroponic_system_id=system.id, recorded_at=data.recorded_at,
                       volume_l=data.water_input_l,
                       source=WaterSource(farm.water_source) if farm and farm.water_source else WaterSource.OTHER,
                       record_type=WaterRecordType.HYDROPONIC, notes="Input from hydroponic record",
                       created_by_id=user.id))
    db.flush()
    audit(db, user, "hydro_record.create", "hydroponic_record", rec.id, {"system_id": str(system.id)}, ip)
    expl = evaluate_system(db, system)
    created = alert_service.apply_alerts(
        db, farm_id=system.farm_id, scope=f"system:{system.id}", explanation=expl,
        scope_codes={r.code for r in load_knowledge(db).rules_in("hydroponics") if r.head.symbol.startswith("alert_")},
        system_id=system.id)
    r = expl.get("recommendation")
    if r and r["action"] != "hydro_status_ok":
        db.add(Recommendation(farm_id=system.farm_id, hydroponic_system_id=system.id, kind="hydroponic",
                              action=r["action"], title_en=r["title_en"] or r["action"],
                              title_ar=r["title_ar"] or r["action"], summary_en=r["text_en"], summary_ar=r["text_ar"],
                              amount_l=None, target_date=ensure_utc(data.recorded_at).date(),  # type: ignore[union-attr]
                              certainty=expl["certainty"], data_quality=expl["data_quality"], payload=expl,
                              created_by_id=user.id))
    db.commit()
    db.refresh(rec)
    return {"record": rec, "balance": balance_for(system, rec).to_dict(), "evaluation": expl,
            "alerts_created": created}


def list_records(db: Session, user: User, system_id: uuid.UUID, page: int, size: int) -> tuple[list[HydroponicRecord], int]:
    get_system(db, user, system_id)
    q = select(HydroponicRecord).where(HydroponicRecord.system_id == system_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.order_by(HydroponicRecord.recorded_at.desc()).offset((page - 1) * size).limit(size)).all()
    return list(items), total


def balance_report(db: Session, user: User, system_id: uuid.UUID) -> dict[str, Any]:
    system = get_system(db, user, system_id)
    records = db.scalars(select(HydroponicRecord).where(HydroponicRecord.system_id == system_id)
                         .order_by(HydroponicRecord.recorded_at)).all()
    if not records:
        return {"system_id": system_id, "has_data": False, "message": "No hydroponic records yet.",
                "totals": None, "records": [], "ranges": _ranges(system)}
    rows = []
    totals = {"input_l": 0.0, "consumed_l": 0.0, "recycled_l": 0.0, "discharged_l": 0.0, "losses_l": 0.0, "days": 0.0}
    for r in records:
        b = balance_for(system, r)
        rows.append({"id": str(r.id), "recorded_at": ensure_utc(r.recorded_at).isoformat(),  # type: ignore[union-attr]
                     "ph": r.ph, "ec": r.ec, "water_temp_c": r.water_temp_c, **b.to_dict()})
        totals["input_l"] += r.water_input_l
        totals["consumed_l"] += r.water_consumed_l or 0.0
        totals["recycled_l"] += r.water_recycled_l or 0.0
        totals["discharged_l"] += r.water_discharged_l or 0.0
        totals["losses_l"] += r.water_losses_l or 0.0
        totals["days"] += r.period_days
    t = {k: round(v, 2) for k, v in totals.items()}
    t["input_per_day_l"] = round(totals["input_l"] / totals["days"], 3) if totals["days"] else None
    t["input_per_plant_day_l"] = (round(totals["input_l"] / totals["days"] / system.plant_count, 4)
                                  if system.plant_count and totals["days"] else None)
    rec_plus_dis = totals["recycled_l"] + totals["discharged_l"]
    t["recirculation_ratio"] = round(totals["recycled_l"] / rec_plus_dis, 4) if rec_plus_dis > 0 else None
    return {"system_id": system_id, "has_data": True, "message": None, "totals": t, "records": rows,
            "ranges": _ranges(system), "evaluation": evaluate_system(db, system)}


def _ranges(s: HydroponicSystem) -> dict[str, Any]:
    return {"ph_min": s.ph_min, "ph_max": s.ph_max, "ec_min": s.ec_min, "ec_max": s.ec_max,
            "source": s.threshold_source, "configured": None not in (s.ph_min, s.ph_max, s.ec_min, s.ec_max)}


def list_profiles(db: Session) -> list[HydroponicProfile]:
    return list(db.scalars(select(HydroponicProfile).order_by(HydroponicProfile.name_en)))
