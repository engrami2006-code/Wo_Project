"""Weather: Open-Meteo provider validation and the online/cached/unavailable fallback."""

from datetime import date, timedelta

import httpx
import pytest
import respx

from app.ai.knowledge_base.loader import load_knowledge
from app.core.database import SessionLocal
from app.integrations.weather.base import WeatherUnavailableError, WeatherValidationError
from app.integrations.weather.open_meteo import OpenMeteoProvider
from app.models import Farm, WeatherSnapshot
from app.models.base import utcnow
from app.services import weather_service
from tests.conftest import FakeProvider, OfflineProvider

URL = "https://api.open-meteo.test/v1/forecast"


def payload(et0=5.1):
    days = [(date.today() + timedelta(days=i)).isoformat() for i in range(3)]
    return {"latitude": 21.5, "longitude": 39.2, "timezone": "Asia/Riyadh",
            "current": {"time": "2026-10-03T10:00", "temperature_2m": 33.1, "relative_humidity_2m": 41,
                        "wind_speed_10m": 3.4, "precipitation": 0, "weather_code": 1},
            "current_units": {"temperature_2m": "°C"},
            "daily": {"time": days, "et0_fao_evapotranspiration": [et0, 5.3, 5.0], "precipitation_sum": [0, 0, 1.2],
                      "precipitation_probability_max": [0, 5, 30], "temperature_2m_max": [38, 37, 36],
                      "temperature_2m_min": [27, 26, 26], "wind_speed_10m_max": [6, 5, 5]},
            "daily_units": {"wind_speed_10m_max": "m/s"}}


@respx.mock
def test_provider_parses_and_validates():
    respx.get(URL).mock(return_value=httpx.Response(200, json=payload()))
    data = OpenMeteoProvider(URL).fetch(21.5, 39.2)
    assert data.daily["et0_fao_evapotranspiration"][0] == 5.1
    assert data.current["relative_humidity_2m"] == 41
    assert data.variables_set == "extended"


@respx.mock
def test_provider_retries_with_core_variables_on_400():
    route = respx.get(URL).mock(side_effect=[httpx.Response(400, json={"error": True}),
                                             httpx.Response(200, json=payload())])
    data = OpenMeteoProvider(URL).fetch(21.5, 39.2)
    assert data.variables_set == "core" and route.call_count == 2


@respx.mock
def test_provider_rejects_implausible_values_and_offline():
    respx.get(URL).mock(return_value=httpx.Response(200, json=payload(et0=-3)))
    with pytest.raises(WeatherValidationError):
        OpenMeteoProvider(URL).fetch(21.5, 39.2)
    respx.get(URL).mock(side_effect=httpx.ConnectError("offline"))
    with pytest.raises(WeatherUnavailableError):
        OpenMeteoProvider(URL).fetch(21.5, 39.2)


def _farm(db):
    farm = Farm(name="W", latitude=21.5, longitude=39.2)
    db.add(farm)
    db.commit()
    return farm


def test_service_fresh_then_cached_then_unavailable():
    with SessionLocal() as db:
        params = load_knowledge(db).params
        farm = _farm(db)
        assert weather_service.get_weather(db, farm, params).status == "unavailable"
        fake = FakeProvider()
        weather_service.set_provider(fake)
        fresh = weather_service.get_weather(db, farm, params)
        assert fresh.status == "fresh" and fresh.fetched_now and fake.calls == 1
        again = weather_service.get_weather(db, farm, params)  # within cache window: no new call
        assert again.status == "fresh" and fake.calls == 1
        weather_service.set_provider(OfflineProvider())
        cached = weather_service.get_weather(db, farm, params, force_refresh=True)
        assert cached.status == "cached" and not cached.stale
        day = weather_service.day_values(cached, date.today())
        assert day.et0_mm == 6.0 and day.precipitation_mm == 0.0


def test_service_flags_stale_snapshot():
    with SessionLocal() as db:
        params = load_knowledge(db).params
        farm = _farm(db)
        db.add(WeatherSnapshot(farm_id=farm.id, provider="x", latitude=1, longitude=1,
                               fetched_at=utcnow() - timedelta(hours=30), current={}, units={},
                               daily={"time": [date.today().isoformat()], "et0_fao_evapotranspiration": [4.0]}))
        db.commit()
        status = weather_service.get_weather(db, farm, params)
        assert status.status == "cached" and status.stale and status.age_hours > 29


def test_air_humidity_never_used_as_soil_moisture():
    import inspect

    from app.ai.perception import irrigation

    assert "relative_humidity_2m" not in inspect.getsource(irrigation)
