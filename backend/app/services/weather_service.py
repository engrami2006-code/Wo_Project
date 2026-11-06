"""Weather with offline fallback.

Online:  fetch → validate → save snapshot → use it (status = fresh)
Offline: latest valid snapshot (status = cached; flagged stale after `stale_weather_hours`)
None:    status = unavailable (never fabricated)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.perception.irrigation import WeatherDay
from app.core.config import get_settings
from app.integrations.weather.base import (
    WeatherProvider,
    WeatherUnavailableError,
    WeatherValidationError,
)
from app.integrations.weather.open_meteo import OpenMeteoProvider
from app.models import Farm, WeatherSnapshot
from app.models.base import ensure_utc, utcnow

logger = logging.getLogger("wo.weather")

_provider_override: WeatherProvider | None = None


def set_provider(provider: WeatherProvider | None) -> None:
    """Dependency injection point (tests, alternative providers)."""
    global _provider_override
    _provider_override = provider


def get_provider() -> WeatherProvider:
    if _provider_override is not None:
        return _provider_override
    s = get_settings()
    return OpenMeteoProvider(s.open_meteo_base_url, s.weather_timeout_seconds)


@dataclass
class WeatherStatus:
    status: str                      # fresh | cached | unavailable
    snapshot: WeatherSnapshot | None
    age_hours: float | None
    stale: bool
    message: str
    fetched_now: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {"status": self.status, "age_hours": None if self.age_hours is None else round(self.age_hours, 2),
                "stale": self.stale, "message": self.message, "fetched_now": self.fetched_now,
                "snapshot": snapshot_dict(self.snapshot) if self.snapshot else None}


def snapshot_dict(s: WeatherSnapshot) -> dict[str, Any]:
    return {"id": str(s.id), "provider": s.provider, "fetched_at": ensure_utc(s.fetched_at).isoformat(),  # type: ignore[union-attr]
            "latitude": s.latitude, "longitude": s.longitude, "timezone": s.timezone, "current": s.current,
            "daily": s.daily, "units": s.units, "variables_set": s.variables_set}


def latest_snapshot(db: Session, farm_id: Any) -> WeatherSnapshot | None:
    return db.scalar(select(WeatherSnapshot).where(WeatherSnapshot.farm_id == farm_id)
                     .order_by(WeatherSnapshot.fetched_at.desc()).limit(1))


def _age_hours(s: WeatherSnapshot, now: datetime) -> float:
    return (now - ensure_utc(s.fetched_at)).total_seconds() / 3600  # type: ignore[operator]


def get_weather(db: Session, farm: Farm, params: dict[str, Any], *, force_refresh: bool = False) -> WeatherStatus:
    now = utcnow()
    stale_h = float(params.get("stale_weather_hours", 12))
    cache_min = float(params.get("weather_cache_minutes", 60))
    latest = latest_snapshot(db, farm.id)
    if latest is not None and not force_refresh and _age_hours(latest, now) * 60 < cache_min:
        age = _age_hours(latest, now)
        return WeatherStatus("fresh", latest, age, False, "Recent snapshot reused (within cache window).")

    reason = "offline mode is enabled"
    if not get_settings().weather_offline_mode:
        try:
            data = get_provider().fetch(farm.latitude, farm.longitude)
            snap = WeatherSnapshot(farm_id=farm.id, provider=data.provider, latitude=data.latitude,
                                   longitude=data.longitude, timezone=data.timezone, fetched_at=now,
                                   current=data.current, daily=data.daily, units=data.units,
                                   variables_set=data.variables_set)
            db.add(snap)
            db.commit()
            return WeatherStatus("fresh", snap, 0.0, False, "Fresh data fetched from the provider.", True)
        except WeatherUnavailableError as exc:
            reason = str(exc)
            logger.warning("weather_unavailable", extra={"farm_id": str(farm.id), "reason": reason})
        except WeatherValidationError as exc:
            reason = f"provider response rejected: {exc}"
            logger.warning("weather_invalid", extra={"farm_id": str(farm.id), "reason": reason})
    if latest is not None:
        age = _age_hours(latest, now)
        stale = age > stale_h
        return WeatherStatus("cached", latest, age, stale,
                             f"Using the latest saved snapshot ({age:.1f} h old) because {reason}.")
    return WeatherStatus("unavailable", None, None, False,
                         f"Weather data is currently unavailable ({reason}) and no snapshot is saved.")


def day_values(status: WeatherStatus, target: date) -> WeatherDay:
    s = status.snapshot
    if s is None or status.status == "unavailable":
        return WeatherDay(status="unavailable")
    times: list[str] = s.daily.get("time", [])
    key = target.isoformat()
    if key not in times:
        # The snapshot does not cover the target date: weather is known but not for that day.
        return WeatherDay(status=status.status, snapshot_id=str(s.id), age_hours=status.age_hours)
    i = times.index(key)

    def pick(name: str) -> float | None:
        arr = s.daily.get(name)  # type: ignore[union-attr]
        if not arr or i >= len(arr) or arr[i] is None:
            return None
        return float(arr[i])

    return WeatherDay(status=status.status, snapshot_id=str(s.id), age_hours=status.age_hours,
                      et0_mm=pick("et0_fao_evapotranspiration"), precipitation_mm=pick("precipitation_sum"),
                      rh_min=pick("minimum_relative_humidity_2m"), wind_mean_10m=pick("mean_wind_speed_10m"))
