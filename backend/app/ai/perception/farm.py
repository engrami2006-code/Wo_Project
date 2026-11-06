"""Farm-level perception for deterministic alerts (weather freshness, usage spikes, gaps)."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.ai.perception.base import PerceptSet, fmt_num


@dataclass
class FarmPerception:
    percepts: PerceptSet
    variables: dict[str, Any]


def perceive_weather(status: str, age_hours: float | None, params: dict[str, Any]) -> FarmPerception:
    ps = PerceptSet()
    available = status in ("fresh", "cached")
    ps.add("weather_available", available, {"status": status})
    v: dict[str, Any] = {"stale_hours": params["stale_weather_hours"]}
    if available and age_hours is not None:
        ps.add("weather_stale", age_hours > float(params["stale_weather_hours"]),
               {"age_hours": round(age_hours, 2), "limit_hours": params["stale_weather_hours"]})
        v["weather_age_h"] = fmt_num(age_hours)
    else:
        ps.add("weather_stale", False, {"reason": "no snapshot"})
    return FarmPerception(ps, v)


def perceive_usage(daily_totals: dict[date, float], today: date,
                   params: dict[str, Any]) -> FarmPerception:
    """Spike detection on the most recent day with records, against the trailing median."""
    ps = PerceptSet()
    v: dict[str, Any] = {"spike_factor": params["usage_spike_factor"]}
    if not daily_totals:
        ps.unknown("usage_spike", "no water records")
        return FarmPerception(ps, v)
    last_day = max(daily_totals)
    previous = [daily_totals[d] for d in sorted(daily_totals) if d < last_day]
    min_days = int(params["min_history_days"])
    if len(previous) < min_days:
        ps.unknown("usage_spike", f"needs at least {min_days} earlier days of records")
        return FarmPerception(ps, v)
    median = statistics.median(previous[-30:])
    factor = float(params["usage_spike_factor"])
    value = daily_totals[last_day]
    spike = median > 0 and value > factor * median
    ps.add("usage_spike", spike, {"date": last_day.isoformat(), "usage_l": round(value, 2),
                                  "median_l": round(median, 2), "factor": factor,
                                  "history_days": len(previous)})
    v.update({"usage_date": last_day.isoformat(), "usage_day_l": fmt_num(value), "median_l": fmt_num(median)})
    return FarmPerception(ps, v)


def perceive_records_gap(last_record_day: date | None, planting_created: date, today: date,
                         params: dict[str, Any]) -> FarmPerception:
    ps = PerceptSet()
    limit = int(params["missing_record_days"])
    reference = last_record_day or planting_created
    gap = (today - reference).days
    ps.add("records_missing", gap > limit, {"last_record": last_record_day.isoformat() if last_record_day else None,
                                            "gap_days": gap, "limit_days": limit})
    return FarmPerception(ps, {"missing_days": limit})
