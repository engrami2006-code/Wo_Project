"""Weather provider abstraction. The application depends on this interface, not on Open-Meteo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class WeatherUnavailableError(Exception):
    """The provider could not be reached (offline, timeout or HTTP error)."""


class WeatherValidationError(Exception):
    """The provider answered, but the payload failed validation. It is never stored."""


@dataclass
class WeatherData:
    provider: str
    latitude: float
    longitude: float
    timezone: str | None
    current: dict[str, Any]
    daily: dict[str, list[Any]]
    units: dict[str, Any] = field(default_factory=dict)
    variables_set: str = "core"


class WeatherProvider(Protocol):
    name: str

    def fetch(self, latitude: float, longitude: float) -> WeatherData:
        """Return validated weather data or raise WeatherUnavailableError/WeatherValidationError."""
        ...
