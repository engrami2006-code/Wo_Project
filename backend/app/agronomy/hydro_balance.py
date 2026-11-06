"""Hydroponic water balance for a record period (measured, never ET-based).

Input = Consumed + Discharged + ΔStorage + Losses(measured) + Unaccounted

Unaccounted water is computed only when consumed, discharged and the reservoir start/end levels
are all recorded. Missing terms are reported, never assumed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BalanceResult:
    input_l: float
    consumed_l: float | None
    recycled_l: float | None
    discharged_l: float | None
    losses_l: float | None
    delta_storage_l: float | None
    unaccounted_l: float | None
    unaccounted_fraction: float | None
    recirculation_ratio: float | None
    input_per_day_l: float
    input_per_plant_day_l: float | None
    input_per_m2_day_l: float | None
    missing_terms: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


def compute_balance(*, input_l: float, consumed_l: float | None, recycled_l: float | None,
                    discharged_l: float | None, losses_l: float | None,
                    reservoir_start_l: float | None, reservoir_end_l: float | None,
                    period_days: float, plant_count: int, area_m2: float) -> BalanceResult:
    if period_days <= 0:
        raise ValueError("period_days must be positive")
    missing: list[str] = []
    delta = None
    if reservoir_start_l is not None and reservoir_end_l is not None:
        delta = reservoir_end_l - reservoir_start_l
    else:
        missing.append("reservoir_start_l/reservoir_end_l")
    if consumed_l is None:
        missing.append("water_consumed_l")
    if discharged_l is None:
        missing.append("water_discharged_l")
    unaccounted = fraction = None
    if consumed_l is not None and discharged_l is not None and delta is not None:
        unaccounted = input_l - consumed_l - discharged_l - delta - (losses_l or 0.0)
        fraction = unaccounted / input_l if input_l > 0 else None
    recirc = None
    if recycled_l is not None and discharged_l is not None and (recycled_l + discharged_l) > 0:
        recirc = recycled_l / (recycled_l + discharged_l)
    per_day = input_l / period_days
    return BalanceResult(
        input_l=input_l, consumed_l=consumed_l, recycled_l=recycled_l, discharged_l=discharged_l,
        losses_l=losses_l, delta_storage_l=delta, unaccounted_l=unaccounted,
        unaccounted_fraction=fraction, recirculation_ratio=recirc, input_per_day_l=per_day,
        input_per_plant_day_l=(per_day / plant_count) if plant_count > 0 else None,
        input_per_m2_day_l=(per_day / area_m2) if area_m2 > 0 else None,
        missing_terms=missing)
