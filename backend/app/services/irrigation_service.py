"""Smart irrigation: FAO-56 calculation → perception → KB agent → explanation → persistence."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.agent import IRRIGATION_CATEGORIES, KBAgent
from app.ai.knowledge_base.loader import KnowledgeSnapshot, load_knowledge
from app.ai.perception.irrigation import (
    IrrigationContext,
    IrrigationPerception,
    perceive_irrigation,
)
from app.core.errors import ValidationAppError
from app.models import Farm, FarmCrop, Recommendation, User, WaterCalculation
from app.optimization.scheduling.csp import (
    IrrigationCSP,
    IrrigationTask,
    ScheduleSpec,
    hhmm,
    parse_hhmm,
)
from app.schemas.ai import IrrigationRequest, ScheduleRequest
from app.schemas.water import CalculationRequest
from app.services import alert_service, weather_service
from app.services.access import Perm, get_farm
from app.services.audit import audit
from app.services.farm_service import crop_params, get_planting

ACTION_AMOUNT = {
    "action_full_irrigation": "gross",
    "action_deficit_irrigation": "available",
    "action_critical_supply": "available",
    "action_postpone_irrigation": "zero",
    "action_no_irrigation": "zero",
}


@dataclass
class PreparedContext:
    planting: FarmCrop
    farm: Farm
    kb: KnowledgeSnapshot
    perception: IrrigationPerception
    weather: weather_service.WeatherStatus
    target: date


def _efficiency(planting: FarmCrop) -> tuple[float | None, str]:
    if planting.irrigation_efficiency is not None:
        return planting.irrigation_efficiency, "planting override"
    if planting.irrigation_method is not None:
        m = planting.irrigation_method
        return m.efficiency, f"{m.name_en} default ({m.source})"
    return None, "not set"


def prepare(db: Session, user: User, planting_id: uuid.UUID, target: date | None,
            available_water_l: float | None, et0_override: float | None,
            precip_override: float | None, perm: Perm = Perm.AI_RUN) -> PreparedContext:
    planting = get_planting(db, user, planting_id, perm)
    farm = get_farm(db, user, planting.farm_id, perm)
    kb = load_knowledge(db)
    target = target or date.today()
    weather = weather_service.get_weather(db, farm, kb.params)
    efficiency, eff_source = _efficiency(planting)
    if efficiency is None:
        raise ValidationAppError("Set an irrigation method or an efficiency for this planting first.",
                                 details={"missing": ["irrigation_method"]})
    if available_water_l is not None:
        avail, avail_src = available_water_l, "request"
    elif farm.daily_water_allowance_l is not None:
        avail, avail_src = farm.daily_water_allowance_l, "farm daily allowance"
    else:
        avail, avail_src = None, None
    ctx = IrrigationContext(
        crop=crop_params(planting.crop), crop_name_en=planting.crop.name_en, crop_name_ar=planting.crop.name_ar,
        area_m2=planting.area_m2, efficiency=efficiency, efficiency_source=eff_source, target_date=target,
        planting_date=planting.planting_date,
        stage_override=planting.stage_override.value if planting.stage_override else None,
        available_water_l=avail, available_source=avail_src, weather=weather_service.day_values(weather, target),
        et0_override_mm=et0_override, precipitation_override_mm=precip_override, params=kb.params)
    return PreparedContext(planting, farm, kb, perceive_irrigation(ctx), weather, target)


def _persist_calculation(db: Session, user: User, prep: PreparedContext) -> WaterCalculation | None:
    calc = prep.perception.calculation
    if calc["result"].get("etc_mm") is None:
        return None
    row = WaterCalculation(farm_id=prep.farm.id, farm_crop_id=prep.planting.id, target_date=prep.target,
                           method=calc["method"], inputs=calc["inputs"], parameters=calc["parameters"],
                           steps=calc["steps"], result=calc["result"],
                           weather_snapshot_id=prep.weather.snapshot.id if prep.weather.snapshot else None,
                           created_by_id=user.id)
    db.add(row)
    db.flush()
    return row


def calculate(db: Session, user: User, req: CalculationRequest, ip: str | None) -> dict[str, Any]:
    prep = prepare(db, user, req.farm_crop_id, req.target_date, None, req.et0_override_mm,
                   req.precipitation_override_mm)
    row = _persist_calculation(db, user, prep)
    if row is None:
        demand = prep.perception.percepts.get("et_demand_positive")
        reasons = [str(demand.evidence.get("reason"))] if demand and demand.value is None else []
        db.commit()
        return {"calculation": None, "status": "insufficient_data", "missing_data": reasons,
                "message": "Insufficient data to calculate the water requirement."}
    audit(db, user, "calculation.create", "water_calculation", row.id, {"farm_crop_id": str(prep.planting.id)}, ip)
    db.commit()
    db.refresh(row)
    return {"calculation": row, "status": "calculated", "missing_data": [],
            "message": "Calculated with FAO-56 single crop coefficient."}


def recommend(db: Session, user: User, req: IrrigationRequest, ip: str | None) -> dict[str, Any]:
    prep = prepare(db, user, req.farm_crop_id, req.target_date, req.available_water_l, req.et0_override_mm,
                   req.precipitation_override_mm)
    perception = prep.perception
    result = perception.calculation["result"]
    amounts: dict[str, float | None] = {}
    for action, kind in ACTION_AMOUNT.items():
        if kind == "gross":
            amounts[action] = result.get("gross_l")
        elif kind == "available":
            amounts[action] = perception.calculation["inputs"].get("available_water_l")
        else:
            amounts[action] = 0.0
    agent = KBAgent(prep.kb, IRRIGATION_CATEGORIES)
    calc_row = _persist_calculation(db, user, prep) if req.persist else None
    calculation = {**perception.calculation, "id": str(calc_row.id) if calc_row else None,
                   "weather_status": prep.weather.to_dict() | {"snapshot": None}}
    cycle = agent.run_cycle(perception.percepts, perception.variables, focus_group="irrigation_action",
                            goals=["irrigate_today", "skip_irrigation_today"], amounts=amounts,
                            calculation=calculation, data_quality=perception.data_quality)
    expl = cycle.explanation
    expl["context"] = {"farm_id": str(prep.farm.id), "farm_name": prep.farm.name,
                       "farm_crop_id": str(prep.planting.id), "crop_name_en": prep.planting.crop.name_en,
                       "crop_name_ar": prep.planting.crop.name_ar, "target_date": prep.target.isoformat(),
                       "area_m2": prep.planting.area_m2}
    rec_id = None
    alerts_created = 0
    if req.persist:
        weather_alerts = alert_service.evaluate_weather_alerts(db, prep.kb, prep.farm, prep.weather.status,
                                                               prep.weather.age_hours)
        alerts_created += weather_alerts
        alerts_created += alert_service.apply_alerts(
            db, farm_id=prep.farm.id, scope=f"planting:{prep.planting.id}:irrigation", explanation=expl,
            scope_codes={"R-ALR-005", "R-ALR-006"}, farm_crop_id=prep.planting.id)
        if expl["recommendation"]:
            r = expl["recommendation"]
            rec = Recommendation(
                farm_id=prep.farm.id, farm_crop_id=prep.planting.id, kind="irrigation", action=r["action"],
                title_en=r["title_en"] or r["action"], title_ar=r["title_ar"] or r["action"],
                summary_en=r["text_en"], summary_ar=r["text_ar"], amount_l=r["amount_l"],
                target_date=prep.target, certainty=expl["certainty"], data_quality=expl["data_quality"],
                payload=expl, created_by_id=user.id)
            db.add(rec)
            db.flush()
            rec_id = rec.id
            audit(db, user, "recommendation.create", "recommendation", rec.id,
                  {"action": r["action"], "farm_crop_id": str(prep.planting.id)}, ip)
        db.commit()
    return {"status": "recommendation" if expl["recommendation"] else "insufficient_data",
            "recommendation_id": rec_id, "explanation": expl, "weather_status": prep.weather.status,
            "alerts_created": alerts_created}


def schedule(db: Session, user: User, req: ScheduleRequest, ip: str | None) -> dict[str, Any]:
    if req.farm_id is not None:
        get_farm(db, user, req.farm_id, Perm.AI_RUN)
    for t in req.tasks:
        if t.farm_crop_id is not None:
            get_planting(db, user, t.farm_crop_id, Perm.AI_RUN)
    kb = load_knowledge(db)
    ws, we = parse_hhmm(req.window_start), parse_hhmm(req.window_end)
    if we <= ws:
        raise ValidationAppError("window_end must be after window_start")
    blocked = [(parse_hhmm(b.start), parse_hhmm(b.end)) for b in req.blocked]
    spec = ScheduleSpec(slot_minutes=req.slot_minutes, window_start_min=ws, window_end_min=we, blocked=blocked,
                        pump_capacity_lph=req.pump_capacity_lph, daily_limit_l=req.daily_limit_l,
                        max_backtracks=int(kb.params.get("csp_max_backtracks", 20000)))
    tasks = [IrrigationTask(key=f"t{i}", name=t.name, volume_l=t.volume_l, flow_lph=t.flow_lph)
             for i, t in enumerate(req.tasks)]
    csp = IrrigationCSP(spec, tasks)
    res = csp.solve()
    rows = []
    for t, src in zip(tasks, req.tasks, strict=True):
        start = res.assignments.get(t.key)
        d = res.durations.get(t.key, 0)
        rows.append({"name": t.name, "farm_crop_id": str(src.farm_crop_id) if src.farm_crop_id else None,
                     "volume_l": t.volume_l, "flow_lph": t.flow_lph, "slots": d,
                     "duration_min": d * req.slot_minutes,
                     "start": hhmm(start * req.slot_minutes) if start is not None else None,
                     "end": hhmm((start + d) * req.slot_minutes) if start is not None else None})
    rows.sort(key=lambda r: (r["start"] or "99:99"))
    audit(db, user, "irrigation.schedule", "farm", req.farm_id, {"status": res.status, "tasks": len(tasks)}, ip)
    db.commit()
    s = res.stats
    return {
        "status": res.status, "message": res.message, "violated": res.violated, "schedule": rows,
        "load_profile": res.load_profile,
        "stats": {"assignments": s.assignments, "backtracks": s.backtracks, "ac3_revisions": s.ac3_revisions,
                  "ac3_pruned": s.ac3_pruned, "forward_checking_pruned": s.fc_pruned,
                  "runtime_ms": round(s.runtime_ms, 2)},
        "formulation": {
            "variables": [t.name for t in tasks],
            "domains": "start slots in the window, avoiding blocked hours (node consistency)",
            "constraints": ["Σ active flow ≤ pump capacity in every slot (global)",
                            "pairwise no-overlap when flow_i + flow_j > capacity (binary, AC-3)",
                            "Σ volume ≤ daily source limit (global)"],
            "heuristics": ["MRV with degree tie-break", "LCV", "forward checking", "AC-3 preprocessing"],
            "neighbors": {t.name: sorted(tasks[int(n[1:])].name for n in csp.neighbors[t.key]) for t in tasks},
        },
    }


def list_recommendations(db: Session, user: User, farm_id: uuid.UUID | None, kind: str | None,
                         page: int, size: int) -> tuple[list[Recommendation], int]:
    from sqlalchemy import func

    from app.services.access import visible_farm_ids

    ids = visible_farm_ids(db, user)
    if farm_id is not None:
        get_farm(db, user, farm_id)
        ids = [farm_id]
    q = select(Recommendation).where(Recommendation.farm_id.in_(ids))
    if kind:
        q = q.where(Recommendation.kind == kind)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.order_by(Recommendation.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    return list(items), total
