"""Deterministic, explainable alerts produced by forward chaining over alert rules."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.agent import ALERT_CATEGORIES, KBAgent
from app.ai.knowledge_base.loader import KnowledgeSnapshot, load_knowledge
from app.ai.perception.base import PerceptSet
from app.ai.perception.farm import perceive_records_gap, perceive_usage, perceive_weather
from app.core.errors import NotFoundError
from app.models import Alert, Farm, FarmCrop, User, WaterRecord
from app.models.base import AlertSeverity, AlertStatus, PlantingStatus, ensure_utc, utcnow
from app.services.access import Perm, get_farm, visible_farm_ids
from app.services.audit import audit


def apply_alerts(db: Session, *, farm_id: uuid.UUID, scope: str, explanation: dict[str, Any],
                 scope_codes: set[str], farm_crop_id: uuid.UUID | None = None,
                 system_id: uuid.UUID | None = None) -> int:
    """Create alerts for fired alert rules (deduplicated) and auto-resolve cleared ones."""
    created = 0
    fired = {a["code"]: a for a in explanation.get("alerts", [])}
    percepts = {p["symbol"]: p for p in explanation.get("percepts", []) if p.get("value") is not None}
    open_alerts = db.scalars(select(Alert).where(Alert.farm_id == farm_id, Alert.status != AlertStatus.RESOLVED,
                                                 Alert.dedupe_key.like(f"%|{scope}"))).all()
    open_by_code = {a.rule_code: a for a in open_alerts}
    for code, a in fired.items():
        if code in open_by_code or code not in scope_codes:
            continue
        evidence = {"percepts": [percepts[s] for s in percepts], "rule": code}
        db.add(Alert(farm_id=farm_id, farm_crop_id=farm_crop_id, hydroponic_system_id=system_id,
                     rule_code=code, symbol=a["symbol"], severity=AlertSeverity(a["severity"]),
                     title_en=a["title_en"] or code, title_ar=a["title_ar"] or code,
                     message_en=a["message_en"], message_ar=a["message_ar"], evidence=evidence,
                     dedupe_key=f"{code}|{scope}"))
        created += 1
    now = utcnow()
    for code, alert in open_by_code.items():
        if code in scope_codes and code not in fired:
            alert.status = AlertStatus.RESOLVED
            alert.resolved_at = now
            alert.resolved_reason = "Condition no longer holds (re-evaluated by the inference engine)."
    return created


def _run_alert_rules(kb: KnowledgeSnapshot, percepts: PerceptSet, variables: dict[str, Any]) -> dict[str, Any]:
    agent = KBAgent(kb, ALERT_CATEGORIES)
    return agent.run_cycle(percepts, variables).explanation


def _codes_for(kb: KnowledgeSnapshot, symbols: set[str]) -> set[str]:
    return {r.code for r in kb.rules_in(*ALERT_CATEGORIES) if any(lit.symbol in symbols for lit in r.body)}


def evaluate_weather_alerts(db: Session, kb: KnowledgeSnapshot, farm: Farm, status: str,
                            age_hours: float | None) -> int:
    fp = perceive_weather(status, age_hours, kb.params)
    expl = _run_alert_rules(kb, fp.percepts, fp.variables)
    return apply_alerts(db, farm_id=farm.id, scope="weather", explanation=expl,
                        scope_codes=_codes_for(kb, {"weather_available", "weather_stale"}))


def daily_totals(db: Session, farm_id: uuid.UUID, since: date) -> dict[date, float]:
    rows = db.execute(select(WaterRecord.recorded_at, WaterRecord.volume_l)
                      .where(WaterRecord.farm_id == farm_id,
                             WaterRecord.recorded_at >= datetime.combine(since, datetime.min.time()))).all()
    totals: dict[date, float] = defaultdict(float)
    for ts, vol in rows:
        totals[ensure_utc(ts).date()] += float(vol)  # type: ignore[union-attr]
    return dict(totals)


def evaluate_usage_alerts(db: Session, kb: KnowledgeSnapshot, farm: Farm, today: date) -> int:
    totals = daily_totals(db, farm.id, today - timedelta(days=60))
    fp = perceive_usage(totals, today, kb.params)
    expl = _run_alert_rules(kb, fp.percepts, fp.variables)
    scope = f"usage:{fp.variables.get('usage_date', today.isoformat())}"
    return apply_alerts(db, farm_id=farm.id, scope=scope, explanation=expl,
                        scope_codes=_codes_for(kb, {"usage_spike"}))


def evaluate_record_gaps(db: Session, kb: KnowledgeSnapshot, farm: Farm, today: date) -> int:
    created = 0
    plantings = db.scalars(select(FarmCrop).where(FarmCrop.farm_id == farm.id,
                                                  FarmCrop.status == PlantingStatus.ACTIVE)).all()
    for p in plantings:
        if p.planting_date is not None and p.planting_date > today:
            continue
        last = db.scalar(select(func.max(WaterRecord.recorded_at)).where(WaterRecord.farm_crop_id == p.id))
        last_day = ensure_utc(last).date() if last else None  # type: ignore[union-attr]
        start = max(ensure_utc(p.created_at).date(), p.planting_date or date.min)  # type: ignore[union-attr]
        fp = perceive_records_gap(last_day, start, today, kb.params)
        fp.variables["planting_label"] = f"{p.crop.name_en}" + (f" ({p.variety})" if p.variety else "")
        expl = _run_alert_rules(kb, fp.percepts, fp.variables)
        created += apply_alerts(db, farm_id=farm.id, scope=f"planting:{p.id}:records", explanation=expl,
                                scope_codes=_codes_for(kb, {"records_missing"}), farm_crop_id=p.id)
    return created


def evaluate_farm(db: Session, user: User, farm_id: uuid.UUID, ip: str | None = None) -> dict[str, int]:
    from app.services.weather_service import latest_snapshot

    farm = get_farm(db, user, farm_id, Perm.AI_RUN)
    kb = load_knowledge(db)
    today = utcnow().date()
    snap = latest_snapshot(db, farm.id)
    age = (utcnow() - ensure_utc(snap.fetched_at)).total_seconds() / 3600 if snap else None  # type: ignore[operator]
    result = {
        "weather": evaluate_weather_alerts(db, kb, farm, "cached" if snap else "unavailable", age),
        "usage": evaluate_usage_alerts(db, kb, farm, today),
        "records": evaluate_record_gaps(db, kb, farm, today),
    }
    audit(db, user, "alerts.evaluate", "farm", farm.id, result, ip)
    db.commit()
    return result


def list_alerts(db: Session, user: User, *, farm_id: uuid.UUID | None, status: str | None,
                severity: str | None, page: int, size: int) -> tuple[list[Alert], int]:
    ids = visible_farm_ids(db, user)
    if farm_id is not None:
        get_farm(db, user, farm_id)
        ids = [farm_id]
    q = select(Alert).where(Alert.farm_id.in_(ids))
    if status:
        q = q.where(Alert.status == AlertStatus(status))
    if severity:
        q = q.where(Alert.severity == AlertSeverity(severity))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.order_by(Alert.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    return list(items), total


def update_alert(db: Session, user: User, alert_id: uuid.UUID, status: str, ip: str | None) -> Alert:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise NotFoundError("Alert not found.")
    get_farm(db, user, alert.farm_id, Perm.RECORD_CREATE)
    now = utcnow()
    if status == "acknowledged":
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = now
    else:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = now
        alert.resolved_reason = "Resolved manually."
    audit(db, user, f"alert.{status}", "alert", alert.id, {"rule": alert.rule_code}, ip)
    db.commit()
    return alert
