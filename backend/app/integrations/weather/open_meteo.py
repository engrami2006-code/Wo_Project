"""Open-Meteo forecast provider (https://open-meteo.com). No API key required.

``relative_humidity_2m`` is AIR humidity at 2 m. It is never interpreted as soil moisture.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.integrations.weather.base import (
    WeatherData,
    WeatherUnavailableError,
    WeatherValidationError,
)

CORE_DAILY = ["et0_fao_evapotranspiration", "precipitation_sum", "precipitation_probability_max",
              "temperature_2m_max", "temperature_2m_min", "wind_speed_10m_max"]
EXTENDED_DAILY = ["minimum_relative_humidity_2m", "mean_wind_speed_10m"]
CURRENT = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "precipitation", "weather_code"]

# Physical plausibility ranges used for validation.
RANGES: dict[str, tuple[float, float]] = {
    "et0_fao_evapotranspiration": (0.0, 30.0),
    "precipitation_sum": (0.0, 2000.0),
    "precipitation_probability_max": (0.0, 100.0),
    "temperature_2m_max": (-90.0, 65.0),
    "temperature_2m_min": (-90.0, 65.0),
    "wind_speed_10m_max": (0.0, 120.0),
    "minimum_relative_humidity_2m": (0.0, 100.0),
    "mean_wind_speed_10m": (0.0, 120.0),
    "temperature_2m": (-90.0, 65.0),
    "relative_humidity_2m": (0.0, 100.0),
    "wind_speed_10m": (0.0, 120.0),
    "precipitation": (0.0, 500.0),
}


def _check_range(name: str, value: Any) -> None:
    if value is None:
        return
    if not isinstance(value, (int, float)):
        raise WeatherValidationError(f"{name}: expected a number, got {type(value).__name__}")
    lo, hi = RANGES.get(name, (float("-inf"), float("inf")))
    if not lo <= float(value) <= hi:
        raise WeatherValidationError(f"{name}={value} is outside the plausible range [{lo}, {hi}]")


def validate_payload(payload: dict[str, Any], daily_vars: list[str]) -> tuple[dict[str, Any], dict[str, list[Any]], dict[str, Any]]:
    if not isinstance(payload, dict):
        raise WeatherValidationError("Response is not a JSON object")
    daily = payload.get("daily")
    if not isinstance(daily, dict) or not isinstance(daily.get("time"), list) or not daily["time"]:
        raise WeatherValidationError("Missing daily.time array")
    n = len(daily["time"])
    clean_daily: dict[str, list[Any]] = {"time": [str(t) for t in daily["time"]]}
    for var in daily_vars:
        values = daily.get(var)
        if values is None:
            if var in CORE_DAILY[:2]:
                raise WeatherValidationError(f"Missing required daily variable {var}")
            continue
        if not isinstance(values, list) or len(values) != n:
            raise WeatherValidationError(f"daily.{var} length does not match daily.time")
        for v in values:
            _check_range(var, v)
        clean_daily[var] = values
    current = payload.get("current") or {}
    clean_current: dict[str, Any] = {}
    if isinstance(current, dict):
        for var in CURRENT:
            if var in current:
                if var != "weather_code":
                    _check_range(var, current[var])
                clean_current[var] = current[var]
        if "time" in current:
            clean_current["time"] = str(current["time"])
    units = {**(payload.get("daily_units") or {}), **{f"current.{k}": v
                                                      for k, v in (payload.get("current_units") or {}).items()}}
    if units.get("wind_speed_10m_max") not in (None, "m/s"):
        raise WeatherValidationError("Unexpected wind unit; m/s was requested")
    return clean_current, clean_daily, units


class OpenMeteoProvider:
    name = "open-meteo"

    def __init__(self, base_url: str, timeout: float = 8.0, client: httpx.Client | None = None) -> None:
        self.base_url = base_url
        self.timeout = timeout
        self._client = client

    def _get(self, params: dict[str, Any]) -> httpx.Response:
        try:
            if self._client is not None:
                return self._client.get(self.base_url, params=params, timeout=self.timeout)
            with httpx.Client(timeout=self.timeout) as client:
                return client.get(self.base_url, params=params)
        except httpx.HTTPError as exc:  # connection errors, timeouts, DNS: offline
            raise WeatherUnavailableError(f"Open-Meteo unreachable: {type(exc).__name__}") from exc

    def fetch(self, latitude: float, longitude: float) -> WeatherData:
        base = {"latitude": latitude, "longitude": longitude, "timezone": "auto", "forecast_days": 3,
                "wind_speed_unit": "ms", "current": ",".join(CURRENT)}
        variables_set = "extended"
        daily_vars = CORE_DAILY + EXTENDED_DAILY
        resp = self._get({**base, "daily": ",".join(daily_vars)})
        if resp.status_code == 400:
            # Some deployments do not know the extended variables; retry with the core set.
            variables_set = "core"
            daily_vars = CORE_DAILY
            resp = self._get({**base, "daily": ",".join(daily_vars)})
        if resp.status_code != 200:
            raise WeatherUnavailableError(f"Open-Meteo returned HTTP {resp.status_code}")
        try:
            payload = resp.json()
        except ValueError as exc:
            raise WeatherValidationError("Response is not valid JSON") from exc
        current, daily, units = validate_payload(payload, daily_vars)
        return WeatherData(provider=self.name, latitude=float(payload.get("latitude", latitude)),
                           longitude=float(payload.get("longitude", longitude)),
                           timezone=payload.get("timezone"), current=current, daily=daily, units=units,
                           variables_set=variables_set)
