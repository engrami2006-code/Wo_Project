"""Smart farm land distribution as a search problem (Russell & Norvig §3.1).

The land is divided into N equal units of ``unit_area_m2``. Crops are decided one at a time
in a fixed order, which removes permutation symmetry.

State       (i, units_used, water_used, allocation[0..i-1])
Actions     choose n_i ∈ [min_i, max_i] for crop i with units_used + n_i ≤ N and
            water_used + n_i·w_i ≤ W
Transition  append n_i and update the totals
Goal test   all m crops decided (i = m), plus the production target for MIN_WATER
Step cost   MAX_PRODUCTION: n_i·(p_max − p_i)   (+ (N − units_used)·p_max for fallow at the goal)
            MIN_WATER:      n_i·w_i
            All costs are ≥ 0. For MAX_PRODUCTION, the total cost equals N·p_max − Production,
            so minimising cost maximises production.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

Objective = Literal["max_production", "min_water"]


@dataclass(frozen=True)
class CropOption:
    key: str
    name: str
    water_per_unit_l: float      # w_i: seasonal gross water for one land unit
    value_per_unit: float        # p_i: production (kg) or value for one land unit
    min_units: int = 0
    max_units: int | None = None


@dataclass(frozen=True)
class State:
    index: int
    units_used: int
    water_used: float
    allocation: tuple[int, ...]



@dataclass
class LandProblem:
    crops: list[CropOption]
    total_units: int
    unit_area_m2: float
    water_available_l: float
    objective: Objective = "max_production"
    production_target: float | None = None   # MIN_WATER: total value/production to reach
    p_max: float = field(init=False)

    def __post_init__(self) -> None:
        if self.total_units <= 0:
            raise ValueError("The land must contain at least one unit")
        self.p_max = max((c.value_per_unit for c in self.crops), default=0.0)

    # ----------------------------------------------------------------- formulation
    def initial_state(self) -> State:
        return State(0, 0, 0.0, ())

    def state_key(self, s: State) -> tuple[int, int, int]:
        """Key for duplicate detection in graph search.

        MAX_PRODUCTION: states with equal (i, units, water) have identical futures.
        MIN_WATER: states with equal (i, units, production) have identical goal conditions, and
        the one with less water used dominates (lower g and more water left).
        Floats are rounded to avoid noise.
        """
        if self.objective == "max_production":
            return (s.index, s.units_used, round(s.water_used * 100))
        return (s.index, s.units_used, round(self.production(s.allocation) * 1000))

    def max_units(self, crop: CropOption) -> int:
        return self.total_units if crop.max_units is None else min(crop.max_units, self.total_units)

    def actions(self, s: State) -> list[int]:
        if s.index >= len(self.crops):
            return []
        crop = self.crops[s.index]
        # Units that later crops must reserve for their minimums
        reserve_units = sum(c.min_units for c in self.crops[s.index + 1:])
        reserve_water = sum(c.min_units * c.water_per_unit_l for c in self.crops[s.index + 1:])
        out = []
        for n in range(crop.min_units, self.max_units(crop) + 1):
            units = s.units_used + n + reserve_units
            water = s.water_used + n * crop.water_per_unit_l + reserve_water
            if units <= self.total_units and water <= self.water_available_l + 1e-9:
                out.append(n)
        return out

    def result(self, s: State, n: int) -> State:
        crop = self.crops[s.index]
        return State(s.index + 1, s.units_used + n, s.water_used + n * crop.water_per_unit_l,
                     (*s.allocation, n))

    def step_cost(self, s: State, n: int, s2: State) -> float:
        crop = self.crops[s.index]
        if self.objective == "max_production":
            cost = n * (self.p_max - crop.value_per_unit)
            if s2.index == len(self.crops):
                cost += (self.total_units - s2.units_used) * self.p_max  # fallow units
            return cost
        return n * crop.water_per_unit_l

    def production(self, allocation: tuple[int, ...]) -> float:
        return sum(n * c.value_per_unit for n, c in zip(allocation, self.crops, strict=False))

    def is_goal(self, s: State) -> bool:
        if s.index != len(self.crops):
            return False
        if self.objective == "min_water" and self.production_target is not None:
            return self.production(s.allocation) + 1e-9 >= self.production_target
        return True

    # ----------------------------------------------------------------- reporting
    def minimum_requirements(self) -> tuple[int, float]:
        return (sum(c.min_units for c in self.crops),
                sum(c.min_units * c.water_per_unit_l for c in self.crops))

    def infeasibility_reason(self) -> str | None:
        units, water = self.minimum_requirements()
        if units > self.total_units:
            return f"Minimum units ({units}) exceed the available land ({self.total_units} units)."
        if water > self.water_available_l + 1e-9:
            return (f"Minimum allocations need {water:,.0f} L but only "
                    f"{self.water_available_l:,.0f} L are available.")
        if self.objective == "min_water" and self.production_target is not None:
            best = upper_bound_value(self.crops, self.total_units, self.water_available_l)
            if best + 1e-9 < self.production_target:
                return (f"Even the best allocation reaches at most {best:,.1f} "
                        f"(target {self.production_target:,.1f}).")
        return None


def upper_bound_value(crops: list[CropOption], units: int, water: float) -> float:
    """Upper bound on achievable value (fractional relaxations, see heuristics.py)."""
    from app.optimization.land_distribution.heuristics import fractional_upper_bound

    ub = fractional_upper_bound(crops, units, water)
    return ub if ub is not None else 0.0


def units_for_area(area_m2: float, unit_area_m2: float) -> int:
    return int(math.floor(area_m2 / unit_area_m2 + 1e-9))
