"""Smart farm land distribution: request → search problem → A* (+ comparison) → explanation."""

from __future__ import annotations

import math
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agronomy.fao56 import seasonal_gross_requirement_l_per_m2
from app.core.errors import NotFoundError, ValidationAppError
from app.models import LandDistributionRequest, LandDistributionResult, User
from app.models.base import Role
from app.optimization.land_distribution.problem import CropOption, LandProblem
from app.optimization.land_distribution.search import ALGORITHMS
from app.schemas.land import LandRequest
from app.services.access import Perm, get_farm, visible_farm_ids
from app.services.audit import audit
from app.services.farm_service import crop_params, get_crop

STATEMENT = "Optimal under the selected objective and constraints."


def build_problem(db: Session, user: User, req: LandRequest) -> tuple[LandProblem, list[dict[str, Any]]]:
    unit_area = req.total_area_m2 / req.num_units
    options: list[CropOption] = []
    details: list[dict[str, Any]] = []
    for i, c in enumerate(req.candidates):
        name, water_src = c.name, "user input"
        w_m2 = c.water_l_per_m2
        seasonal = None
        if c.crop_id is not None:
            crop = get_crop(db, user, c.crop_id)
            name = c.name or crop.name_en
            if w_m2 is None:
                if req.season_et0_mm_day is None or req.efficiency is None:
                    raise ValidationAppError("season_et0_mm_day and efficiency are required to derive water from "
                                             "FAO-56 coefficients (or give water_l_per_m2).")
                seasonal = seasonal_gross_requirement_l_per_m2(crop_params(crop), req.season_et0_mm_day,
                                                               req.efficiency)
                w_m2 = seasonal["gross_l_per_m2"]
                water_src = f"FAO-56 seasonal: {seasonal['formula']}"
        assert w_m2 is not None and name
        value_per_m2 = c.yield_kg_per_m2 * (c.price_per_kg if req.use_value and c.price_per_kg is not None else 1.0)
        min_units = math.ceil(c.min_area_m2 / unit_area - 1e-9) if c.min_area_m2 else 0
        if c.min_production_kg:
            min_units = max(min_units, math.ceil(c.min_production_kg / (c.yield_kg_per_m2 * unit_area) - 1e-9))
        max_units = math.floor(c.max_area_m2 / unit_area + 1e-9) if c.max_area_m2 else None
        if max_units is not None and max_units < min_units:
            raise ValidationAppError(f"{name}: maximum area is smaller than the minimum required by its targets.")
        options.append(CropOption(key=f"c{i}", name=name, water_per_unit_l=w_m2 * unit_area,
                                  value_per_unit=value_per_m2 * unit_area, min_units=min_units, max_units=max_units))
        details.append({"name": name, "crop_id": str(c.crop_id) if c.crop_id else None, "water_l_per_m2": round(w_m2, 2),
                        "water_source": water_src, "seasonal": seasonal, "yield_kg_per_m2": c.yield_kg_per_m2,
                        "price_per_kg": c.price_per_kg, "min_units": min_units, "max_units": max_units})
    target = None
    if req.objective == "min_water":
        target = req.production_target_kg
    return LandProblem(crops=options, total_units=req.num_units, unit_area_m2=unit_area,
                       water_available_l=req.available_water_l, objective=req.objective,
                       production_target=target), details


def optimize(db: Session, user: User, req: LandRequest, ip: str | None) -> dict[str, Any]:
    if req.farm_id is not None:
        get_farm(db, user, req.farm_id, Perm.AI_RUN)
    problem, details = build_problem(db, user, req)
    request_row = LandDistributionRequest(farm_id=req.farm_id, created_by_id=user.id, objective=req.objective,
                                          inputs=req.model_dump(mode="json"))
    db.add(request_row)
    db.flush()
    formulation = {
        "state": "(i, units_used, water_used, allocation of crops 0..i-1)",
        "initial_state": "(0, 0, 0, ())",
        "actions": "choose n_i ∈ [min_i, max_i] units for crop i, keeping land and water feasible "
                   "(after reserving the minimums of later crops)",
        "transition": "append n_i; units += n_i; water += n_i·w_i",
        "goal_test": "all crops decided" + (" and production ≥ target" if req.objective == "min_water" else ""),
        "step_cost": ("n_i·(p_max − p_i), plus fallow units × p_max at the goal (minimising cost ≡ maximising "
                      "production)" if req.objective == "max_production" else "n_i·w_i (water used)"),
        "heuristic": ("h = U·p_max − UB, where UB = min(land-relaxed, water-relaxed fractional knapsack). "
                      "Admissible because UB ≥ any feasible completion."
                      if req.objective == "max_production" else
                      "h = water for the remaining minimums + cheapest fractional water for the remaining target "
                      "(land constraint relaxed). Admissible lower bound."),
        "units": req.num_units, "unit_area_m2": round(problem.unit_area_m2, 3), "p_max": round(problem.p_max, 4),
        "candidates": details,
    }
    reason = problem.infeasibility_reason()
    comparison: list[dict[str, Any]] = []
    status = "infeasible"
    allocation: list[dict[str, Any]] = []
    totals: dict[str, Any] = {}
    binding: list[str] = []
    message = reason or ""
    if reason is None:
        algos = list(dict.fromkeys(["astar", *req.algorithms]))
        results = {name: ALGORITHMS[name](problem) for name in algos}
        comparison = [results[n].summary(problem) for n in algos]
        best = results["astar"]
        if best.found and best.state is not None:
            status = "optimal"
            s = best.state
            for n, c, d in zip(s.allocation, problem.crops, details, strict=True):
                allocation.append({"name": c.name, "units": n, "area_m2": round(n * problem.unit_area_m2, 2),
                                   "water_l": round(n * c.water_per_unit_l, 2),
                                   "production_kg": round(n * d["yield_kg_per_m2"] * problem.unit_area_m2, 2),
                                   "value": round(n * c.value_per_unit, 2), "min_units": c.min_units,
                                   "max_units": c.max_units})
            used_units = sum(s.allocation)
            totals = {"units_used": used_units, "fallow_units": req.num_units - used_units,
                      "area_used_m2": round(used_units * problem.unit_area_m2, 2),
                      "water_used_l": round(s.water_used, 2), "water_available_l": req.available_water_l,
                      "water_left_l": round(req.available_water_l - s.water_used, 2),
                      "production_kg": round(sum(a["production_kg"] for a in allocation), 2),
                      "objective_value": round(problem.production(s.allocation), 3)
                      if req.objective == "max_production" else round(s.water_used, 2),
                      "path_cost": round(best.cost or 0.0, 3)}
            if used_units == req.num_units:
                binding.append("land")
            remaining = [c for c, n in zip(problem.crops, s.allocation, strict=True)
                         if c.max_units is None or n < c.max_units]
            if remaining and req.available_water_l - s.water_used < min(c.water_per_unit_l for c in remaining):
                binding.append("water")
            for c, n in zip(problem.crops, s.allocation, strict=True):
                if c.max_units is not None and n == c.max_units:
                    binding.append(f"max_area:{c.name}")
                if c.min_units and n == c.min_units:
                    binding.append(f"min_target:{c.name}")
            message = STATEMENT
        elif best.limit_reached:
            status = "limit_reached"
            message = "The search budget was exhausted; reduce the number of units or candidates."
        else:
            message = "No allocation satisfies all constraints."
    result_row = LandDistributionResult(request_id=request_row.id, status=status, allocation=allocation,
                                        objective_value=totals.get("objective_value"),
                                        total_water_l=totals.get("water_used_l"),
                                        total_production=totals.get("production_kg"),
                                        search_stats={"formulation": formulation, "totals": totals,
                                                      "binding": binding},
                                        comparison=comparison, message=message)
    db.add(result_row)
    audit(db, user, "land_distribution.optimize", "land_distribution_request", request_row.id,
          {"status": status, "objective": req.objective}, ip)
    db.commit()
    return {"request_id": request_row.id, "status": status, "objective": req.objective,
            "statement": STATEMENT if status == "optimal" else "", "message": message, "allocation": allocation,
            "totals": totals, "binding_constraints": binding, "formulation": formulation, "comparison": comparison,
            "created_at": request_row.created_at}


def list_requests(db: Session, user: User, page: int, size: int) -> tuple[list[dict[str, Any]], int]:
    q = select(LandDistributionRequest)
    if user.role != Role.SUPER_ADMIN:
        farm_ids = visible_farm_ids(db, user)
        q = q.where((LandDistributionRequest.created_by_id == user.id) |
                    (LandDistributionRequest.farm_id.in_(farm_ids)))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(LandDistributionRequest.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    out = []
    for r in rows:
        res = db.scalar(select(LandDistributionResult).where(LandDistributionResult.request_id == r.id))
        out.append({"id": r.id, "objective": r.objective, "created_at": r.created_at, "farm_id": r.farm_id,
                    "status": res.status if res else None, "objective_value": res.objective_value if res else None,
                    "total_water_l": res.total_water_l if res else None,
                    "total_area_m2": r.inputs.get("total_area_m2")})
    return out, total


def get_request(db: Session, user: User, request_id: uuid.UUID) -> dict[str, Any]:
    r = db.get(LandDistributionRequest, request_id)
    if r is None:
        raise NotFoundError("Request not found.")
    if (user.role != Role.SUPER_ADMIN and r.created_by_id != user.id
            and (r.farm_id is None or r.farm_id not in visible_farm_ids(db, user))):
        raise NotFoundError("Request not found.")
    res = db.scalar(select(LandDistributionResult).where(LandDistributionResult.request_id == r.id))
    return {"id": r.id, "objective": r.objective, "inputs": r.inputs, "created_at": r.created_at,
            "result": None if res is None else {
                "status": res.status, "allocation": res.allocation, "objective_value": res.objective_value,
                "total_water_l": res.total_water_l, "total_production": res.total_production,
                "search_stats": res.search_stats, "comparison": res.comparison, "message": res.message}}
