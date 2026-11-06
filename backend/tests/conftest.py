"""Test configuration.

Default: an isolated SQLite file database per test session, rebuilt for every test.
Set TEST_DATABASE_URL (e.g. postgresql+psycopg://wo:wo_dev_password@localhost:5432/wo_test) to run the
same suite against PostgreSQL. The weather provider is replaced by an in-process fake: no network.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any

_TMP = tempfile.mkdtemp(prefix="wo-tests-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_TMP}/wo_test.db")
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["WEATHER_OFFLINE_MODE"] = "false"
os.environ["ENVIRONMENT"] = "test"
os.environ["LOG_LEVEL"] = "WARNING"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.ai.knowledge_base.seed import seed_reference_knowledge  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.integrations.weather.base import WeatherData, WeatherUnavailableError  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.services import auth_service, weather_service  # noqa: E402

PASSWORD = "StrongPass123"


class OfflineProvider:
    name = "offline-fake"

    def fetch(self, latitude: float, longitude: float) -> WeatherData:
        raise WeatherUnavailableError("test: no network")


class FakeProvider:
    """Deterministic provider returning a validated-looking 3-day forecast starting today."""

    name = "fake-open-meteo"

    def __init__(self, et0: float = 6.0, rain: float = 0.0) -> None:
        self.et0 = et0
        self.rain = rain
        self.calls = 0

    def fetch(self, latitude: float, longitude: float) -> WeatherData:
        self.calls += 1
        days = [(date.today() + timedelta(days=i)).isoformat() for i in range(3)]
        return WeatherData(provider=self.name, latitude=latitude, longitude=longitude, timezone="UTC",
                           current={"temperature_2m": 31.0, "relative_humidity_2m": 40, "wind_speed_10m": 3.1},
                           daily={"time": days, "et0_fao_evapotranspiration": [self.et0] * 3,
                                  "precipitation_sum": [self.rain] * 3,
                                  "temperature_2m_max": [36.0] * 3, "temperature_2m_min": [24.0] * 3},
                           units={}, variables_set="core")


@pytest.fixture(autouse=True)
def fresh_database() -> Iterator[None]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_reference_knowledge(db)
        db.commit()
    auth_service.login_limiter.reset()
    auth_service.register_limiter.reset()
    weather_service.set_provider(OfflineProvider())
    yield
    weather_service.set_provider(None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def register(client: TestClient, email: str, *, company: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"email": email, "password": PASSWORD, "full_name": "Test User"}
    if company:
        payload |= {"account_type": "company", "company_name": company}
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class Actor:
    """Convenience wrapper: an authenticated user with helpers."""

    def __init__(self, client: TestClient, token: str, user: dict[str, Any]) -> None:
        self.client = client
        self.token = token
        self.user = user
        self.h = auth(token)

    def get(self, url: str, **kw: Any):  # type: ignore[no-untyped-def]
        return self.client.get(url, headers=self.h, **kw)

    def post(self, url: str, **kw: Any):  # type: ignore[no-untyped-def]
        return self.client.post(url, headers=self.h, **kw)

    def patch(self, url: str, **kw: Any):  # type: ignore[no-untyped-def]
        return self.client.patch(url, headers=self.h, **kw)

    def delete(self, url: str, **kw: Any):  # type: ignore[no-untyped-def]
        return self.client.delete(url, headers=self.h, **kw)


def make_actor(client: TestClient, email: str, company: str | None = None) -> Actor:
    data = register(client, email, company=company)
    return Actor(client, data["access_token"], data["user"])


def login_actor(client: TestClient, email: str, password: str = PASSWORD) -> Actor:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return Actor(client, r.json()["access_token"], r.json()["user"])


@pytest.fixture
def owner(client: TestClient) -> Actor:
    return make_actor(client, f"owner-{uuid.uuid4().hex[:6]}@example.com", company="Alpha Farms")


@pytest.fixture
def other_owner(client: TestClient) -> Actor:
    return make_actor(client, f"rival-{uuid.uuid4().hex[:6]}@example.com", company="Beta Farms")


def crop_id(actor: Actor, code: str) -> str:
    crops = actor.get("/api/crops").json()
    return next(c["id"] for c in crops if c["code"] == code)


def method_id(actor: Actor, code: str) -> str:
    return next(m["id"] for m in actor.get("/api/irrigation/methods").json() if m["code"] == code)


def create_farm(actor: Actor, **kw: Any) -> dict[str, Any]:
    payload = {"name": "Test Farm", "latitude": 21.49, "longitude": 39.19, "total_area_m2": 50000,
               "water_source": "well"} | kw
    r = actor.post("/api/farms", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def create_planting(actor: Actor, farm_id: str, code: str = "tomato", days: int = 80, area: float = 1000,
                    method: str = "drip", **kw: Any) -> dict[str, Any]:
    payload = {"crop_id": crop_id(actor, code), "area_m2": area,
               "planting_date": (date.today() - timedelta(days=days)).isoformat(),
               "irrigation_method_id": method_id(actor, method)} | kw
    r = actor.post(f"/api/farms/{farm_id}/crops", json=payload)
    assert r.status_code == 201, r.text
    return r.json()
