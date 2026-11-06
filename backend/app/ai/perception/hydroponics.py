"""Perception for hydroponic systems (configured ranges + measured water balance)."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.agronomy.hydro_balance import BalanceResult
from app.ai.perception.base import PerceptSet, fmt_num


@dataclass
class HydroSystemView:
    name: str
    is_closed_loop: bool
    ph_min: float | None
    ph_max: float | None
    ec_min: float | None
    ec_max: float | None
    threshold_source: str | None
    is_active: bool


@dataclass
class HydroRecordView:
    recorded_at: datetime
    ph: float | None
    ec: float | None
    discharged_l: float | None
    input_per_day_l: float


@dataclass
class HydroPerception:
    percepts: PerceptSet
    variables: dict[str, Any]


def perceive_hydroponics(system: HydroSystemView, latest: HydroRecordView | None,
                         latest_balance: BalanceResult | None, history: list[HydroRecordView],
                         now: datetime, params: dict[str, Any]) -> HydroPerception:
    ps = PerceptSet()
    v: dict[str, Any] = {
        "system_name": system.name, "ph_min": fmt_num(system.ph_min, 2), "ph_max": fmt_num(system.ph_max, 2),
        "ec_min": fmt_num(system.ec_min, 2), "ec_max": fmt_num(system.ec_max, 2),
        "threshold_source": system.threshold_source or "user-configured range",
        "spike_factor": params["usage_spike_factor"], "missing_days": params["hydro_missing_record_days"],
    }

    # records missing
    if system.is_active:
        limit = float(params["hydro_missing_record_days"])
        if latest is None:
            ps.add("hydro_records_missing", True, {"last_record": None, "limit_days": limit})
        else:
            age_days = (now - latest.recorded_at).total_seconds() / 86400
            ps.add("hydro_records_missing", age_days > limit,
                   {"last_record": latest.recorded_at.isoformat(), "age_days": round(age_days, 2),
                    "limit_days": limit})
    else:
        ps.add("hydro_records_missing", False, {"reason": "system not active"})

    if latest is None:
        for sym in ("ph_below_range", "ph_above_range", "ec_below_range", "ec_above_range",
                    "closed_loop_discharge", "hydro_usage_spike", "hydro_unaccounted_high"):
            ps.unknown(sym, "no hydroponic record yet", ["hydro_record"])
        return HydroPerception(ps, v)

    v.update({"ph": fmt_num(latest.ph, 2), "ec": fmt_num(latest.ec, 2),
              "input_per_day_l": fmt_num(latest.input_per_day_l)})

    # pH
    if latest.ph is None:
        ps.unknown("ph_below_range", "latest record has no pH reading", ["ph"])
        ps.unknown("ph_above_range", "latest record has no pH reading", ["ph"])
    else:
        if system.ph_min is None:
            ps.unknown("ph_below_range", "pH minimum not configured", ["ph_range"])
        else:
            below = latest.ph < system.ph_min
            ps.add("ph_below_range", below, {"ph": latest.ph, "ph_min": system.ph_min},
                   f"pH {'≥' if below else '<'} {system.ph_min}", f"pH {'≥' if below else '<'} {system.ph_min}")
        if system.ph_max is None:
            ps.unknown("ph_above_range", "pH maximum not configured", ["ph_range"])
        else:
            above = latest.ph > system.ph_max
            ps.add("ph_above_range", above, {"ph": latest.ph, "ph_max": system.ph_max},
                   f"pH {'≤' if above else '>'} {system.ph_max}", f"pH {'≤' if above else '>'} {system.ph_max}")
    # EC
    if latest.ec is None:
        ps.unknown("ec_below_range", "latest record has no EC reading", ["ec"])
        ps.unknown("ec_above_range", "latest record has no EC reading", ["ec"])
    else:
        if system.ec_min is None:
            ps.unknown("ec_below_range", "EC minimum not configured", ["ec_range"])
        else:
            below = latest.ec < system.ec_min
            ps.add("ec_below_range", below, {"ec": latest.ec, "ec_min": system.ec_min},
                   f"EC {'≥' if below else '<'} {system.ec_min}", f"EC {'≥' if below else '<'} {system.ec_min}")
        if system.ec_max is None:
            ps.unknown("ec_above_range", "EC maximum not configured", ["ec_range"])
        else:
            above = latest.ec > system.ec_max
            ps.add("ec_above_range", above, {"ec": latest.ec, "ec_max": system.ec_max},
                   f"EC {'≤' if above else '>'} {system.ec_max}", f"EC {'≤' if above else '>'} {system.ec_max}")

    # closed loop
    if not system.is_closed_loop:
        ps.add("closed_loop_discharge", False, {"reason": "open system"})
    elif latest.discharged_l is None:
        ps.unknown("closed_loop_discharge", "discharge not recorded", ["hydro_record"])
    else:
        ps.add("closed_loop_discharge", latest.discharged_l > 0,
               {"discharged_l": latest.discharged_l, "closed_loop": True})
        v["discharged_l"] = fmt_num(latest.discharged_l)

    # consumption spike (needs history)
    min_days = int(params["min_history_days"])
    previous = [h.input_per_day_l for h in history if h.recorded_at < latest.recorded_at]
    if len(previous) >= min_days:
        median = statistics.median(previous[-30:])
        factor = float(params["usage_spike_factor"])
        spike = median > 0 and latest.input_per_day_l > factor * median
        ps.add("hydro_usage_spike", spike,
               {"input_per_day_l": round(latest.input_per_day_l, 2), "median_l": round(median, 2),
                "factor": factor, "history_records": len(previous)},
               f"input {'≤' if spike else '>'} {fmt_num(factor * median)} L/day",
               f"المُدخل {'≤' if spike else '>'} {fmt_num(factor * median)} لتر/يوم")
        v["median_l"] = fmt_num(median)
    else:
        ps.unknown("hydro_usage_spike", f"needs at least {min_days} earlier records", ["hydro_records"])

    # unaccounted water
    if latest_balance is not None and latest_balance.unaccounted_fraction is not None:
        limit = float(params["hydro_unaccounted_fraction"])
        high = latest_balance.unaccounted_fraction > limit
        ps.add("hydro_unaccounted_high", high,
               {"unaccounted_l": round(latest_balance.unaccounted_l or 0, 2),
                "fraction": round(latest_balance.unaccounted_fraction, 4), "limit": limit})
        v["unaccounted_l"] = fmt_num(latest_balance.unaccounted_l)
        v["unaccounted_pct"] = fmt_num(latest_balance.unaccounted_fraction * 100, 1)
    else:
        missing = latest_balance.missing_terms if latest_balance else ["record"]
        ps.unknown("hydro_unaccounted_high", "balance incomplete: " + ", ".join(missing), ["hydro_record"])
    return HydroPerception(ps, v)
