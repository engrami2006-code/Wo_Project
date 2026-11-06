"""Admissible heuristics derived from a *relaxed problem* (Russell & Norvig §3.6.2).

Relaxation: allow fractional land units. With one resource at a time, the fractional bounded
knapsack is solved optimally by a greedy fill in order of value density. The value of a relaxed
optimum is an upper bound (UB) on the value of any integer completion. With two resources
(land and water), the minimum of the two single-resource relaxations is still an upper bound.

MAX_PRODUCTION:  h(s) = U·p_max − UB(s)
    The true remaining cost is U·p_max − V_actual, and V_actual ≤ UB(s), so h(s) ≤ h*(s).
    h is therefore admissible and A* is optimal.

MIN_WATER:       h(s) = mandatory water for remaining minimums
                        + cheapest fractional water to cover the remaining production target
                          (land constraint dropped, per-crop caps kept).
    This is the optimum of a relaxed problem, so it is a lower bound on the water of any
    feasible completion: h is admissible. A separate land-only relaxation detects dead ends.
"""

from __future__ import annotations

from app.optimization.land_distribution.problem import CropOption, LandProblem, State

INFEASIBLE = float("inf")


def _caps(crops: list[CropOption], units: int) -> list[int]:
    return [units if c.max_units is None else min(c.max_units, units) for c in crops]


def fractional_upper_bound(crops: list[CropOption], units: int, water: float) -> float | None:
    """UB on value for ``crops`` given ``units`` of land and ``water`` litres; None if minimums don't fit."""
    if not crops:
        return 0.0
    caps = _caps(crops, units)
    base_units = sum(c.min_units for c in crops)
    base_water = sum(c.min_units * c.water_per_unit_l for c in crops)
    if base_units > units or base_water > water + 1e-9:
        return None
    base_value = sum(c.min_units * c.value_per_unit for c in crops)
    free_units = units - base_units
    free_water = water - base_water
    extra = [(c, max(0, cap - c.min_units)) for c, cap in zip(crops, caps, strict=True)]

    # Relaxation A: ignore water, fill land by value per unit.
    land_ub = 0.0
    left = float(free_units)
    for c, room in sorted(extra, key=lambda x: -x[0].value_per_unit):
        take = min(room, left)
        land_ub += take * c.value_per_unit
        left -= take
        if left <= 0:
            break

    # Relaxation B: ignore land (except per-crop caps), fill water by value per litre.
    water_ub = 0.0
    left_w = free_water
    for c, room in sorted(extra, key=lambda x: -(x[0].value_per_unit / x[0].water_per_unit_l
                                                 if x[0].water_per_unit_l > 0 else float("inf"))):
        if c.water_per_unit_l <= 0:
            water_ub += room * c.value_per_unit
            continue
        take = min(float(room), left_w / c.water_per_unit_l)
        water_ub += take * c.value_per_unit
        left_w -= take * c.water_per_unit_l
        if left_w <= 1e-12:
            break
    return base_value + min(land_ub, water_ub)


def h_max_production(problem: LandProblem, s: State) -> float:
    if s.index >= len(problem.crops):
        return 0.0  # fallow cost was already charged on the transition into the goal
    remaining = problem.crops[s.index:]
    units_left = problem.total_units - s.units_used
    water_left = problem.water_available_l - s.water_used
    ub = fractional_upper_bound(remaining, units_left, water_left)
    if ub is None:
        return INFEASIBLE
    return max(0.0, units_left * problem.p_max - ub)


def h_min_water(problem: LandProblem, s: State) -> float:
    remaining = problem.crops[s.index:]
    units_left = problem.total_units - s.units_used
    water_left = problem.water_available_l - s.water_used
    mandatory_units = sum(c.min_units for c in remaining)
    mandatory_water = sum(c.min_units * c.water_per_unit_l for c in remaining)
    if mandatory_units > units_left or mandatory_water > water_left + 1e-9:
        return INFEASIBLE
    if problem.production_target is None:
        return mandatory_water
    produced = problem.production(s.allocation) + sum(c.min_units * c.value_per_unit for c in remaining)
    need = problem.production_target - produced
    if need <= 1e-9:
        return mandatory_water
    caps = _caps(remaining, units_left)
    rooms = [(c, cap - c.min_units) for c, cap in zip(remaining, caps, strict=True) if c.value_per_unit > 0]
    # Feasibility (land relaxation): the most value the free land can still add.
    free_units = float(units_left - mandatory_units)
    best_value, left = 0.0, free_units
    for c, room in sorted(rooms, key=lambda x: -x[0].value_per_unit):
        take = min(float(room), left)
        best_value += take * c.value_per_unit
        left -= take
    if best_value + 1e-9 < need:
        return INFEASIBLE
    # Water lower bound (drop the land constraint, keep per-crop caps): fill the remaining
    # target with the cheapest water per unit of value. This is the exact optimum of a relaxed
    # problem, hence a lower bound on the true water.
    extra_water = 0.0
    for c, room in sorted(rooms, key=lambda x: x[0].water_per_unit_l / x[0].value_per_unit):
        take = min(float(room), need / c.value_per_unit)
        extra_water += take * c.water_per_unit_l
        need -= take * c.value_per_unit
        if need <= 1e-9:
            break
    if need > 1e-9:
        return INFEASIBLE
    return mandatory_water + extra_water


def heuristic_for(problem: LandProblem):  # type: ignore[no-untyped-def]
    return h_max_production if problem.objective == "max_production" else h_min_water
