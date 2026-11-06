"""RBAC and resource isolation (IDOR): another tenant's resources are invisible (404)."""

from datetime import UTC, datetime

import pytest

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User
from app.models.base import Role
from tests.conftest import PASSWORD, create_farm, create_planting, login_actor, make_actor


@pytest.fixture
def tenant_a(owner):
    farm = create_farm(owner)
    planting = create_planting(owner, farm["id"])
    system = owner.post("/api/hydroponics", json={"farm_id": farm["id"], "name": "NFT-1", "system_type": "NFT",
                                                  "growing_area_m2": 40, "plant_count": 300,
                                                  "reservoir_capacity_l": 800}).json()
    record = owner.post("/api/water/records", json={"farm_id": farm["id"], "farm_crop_id": planting["id"],
                                                    "recorded_at": datetime.now(UTC).isoformat(), "volume_l": 500,
                                                    "source": "well"}).json()
    rec = owner.post("/api/irrigation/recommendation", json={"farm_crop_id": planting["id"], "et0_override_mm": 6,
                                                             "precipitation_override_mm": 0,
                                                             "available_water_l": 100}).json()
    alerts = owner.get("/api/alerts").json()["items"]
    return {"farm": farm, "planting": planting, "system": system, "record": record,
            "rec_id": rec["recommendation_id"], "alert_id": alerts[0]["id"], "company": owner.user["company_id"]}


def test_other_company_gets_404_everywhere(tenant_a, other_owner):
    a = tenant_a
    b = other_owner
    checks = [
        b.get(f"/api/farms/{a['farm']['id']}"),
        b.patch(f"/api/farms/{a['farm']['id']}", json={"name": "hacked"}),
        b.delete(f"/api/farms/{a['farm']['id']}"),
        b.get(f"/api/farms/{a['farm']['id']}/crops"),
        b.get(f"/api/farm-crops/{a['planting']['id']}"),
        b.get(f"/api/companies/{a['company']}/farms"),
        b.get(f"/api/companies/{a['company']}"),
        b.get(f"/api/hydroponics/{a['system']['id']}"),
        b.post(f"/api/hydroponics/{a['system']['id']}/records",
               json={"recorded_at": datetime.now(UTC).isoformat(), "water_input_l": 1}),
        b.delete(f"/api/water/records/{a['record']['id']}"),
        b.get(f"/api/weather/{a['farm']['id']}"),
        b.get(f"/api/recommendations/{a['rec_id']}"),
        b.patch(f"/api/alerts/{a['alert_id']}", json={"status": "resolved"}),
        b.post("/api/irrigation/recommendation", json={"farm_crop_id": a["planting"]["id"]}),
        b.post("/api/water/calculations", json={"farm_crop_id": a["planting"]["id"]}),
        b.post("/api/water/records", json={"farm_id": a["farm"]["id"], "recorded_at": datetime.now(UTC).isoformat(),
                                           "volume_l": 1, "source": "well"}),
        b.get(f"/api/water/analytics?farm_id={a['farm']['id']}"),
        b.post(f"/api/alerts/evaluate?farm_id={a['farm']['id']}"),
    ]
    assert [r.status_code for r in checks] == [404] * len(checks)
    # lists are scoped, not leaked
    assert b.get("/api/farms").json()["total"] == 0
    assert b.get("/api/water/records").json()["total"] == 0
    assert b.get("/api/alerts").json()["total"] == 0
    assert b.get("/api/hydroponics").json() == []


def test_individual_users_are_isolated(client):
    x = make_actor(client, "x1@example.com")
    y = make_actor(client, "y1@example.com")
    farm = create_farm(x)
    assert y.get(f"/api/farms/{farm['id']}").status_code == 404
    assert x.get(f"/api/farms/{farm['id']}").status_code == 200


def test_employee_permissions_and_assignment(client, owner, tenant_a):
    r = owner.post("/api/users", json={"email": "emp@example.com", "password": PASSWORD, "full_name": "Emp One",
                                       "role": "EMPLOYEE"})
    assert r.status_code == 201
    emp = login_actor(client, "emp@example.com")
    farm_id = tenant_a["farm"]["id"]
    assert emp.get(f"/api/farms/{farm_id}").status_code == 404  # not assigned yet
    assert owner.post(f"/api/farms/{farm_id}/members", json={"user_id": emp.user["id"]}).status_code == 201
    assert emp.get(f"/api/farms/{farm_id}").status_code == 200
    rec = emp.post("/api/water/records", json={"farm_id": farm_id, "recorded_at": datetime.now(UTC).isoformat(),
                                               "volume_l": 10, "source": "well"})
    assert rec.status_code == 201
    assert emp.delete(f"/api/water/records/{rec.json()['id']}").status_code == 403
    assert emp.patch(f"/api/farms/{farm_id}", json={"name": "x"}).status_code == 403
    assert emp.delete(f"/api/farms/{farm_id}").status_code == 403
    assert emp.post("/api/farms", json={"name": "n", "latitude": 1, "longitude": 1}).status_code == 403
    assert emp.get("/api/users").status_code == 403
    assert emp.get("/api/admin/audit-logs").status_code == 403


def test_owner_cannot_create_admin_or_touch_other_company_users(owner, other_owner):
    r = owner.post("/api/users", json={"email": "sa@example.com", "password": PASSWORD, "full_name": "Sa",
                                       "role": "SUPER_ADMIN"})
    assert r.status_code == 403
    assert owner.get(f"/api/users/{other_owner.user['id']}").status_code == 404


def test_only_super_admin_edits_the_knowledge_base(client, owner):
    rules = owner.get("/api/knowledge-base/rules").json()
    rid = rules[0]["id"]
    assert owner.patch(f"/api/knowledge-base/rules/{rid}", json={"priority": 55}).status_code == 403
    with SessionLocal() as db:
        db.add(User(email="root@wo.local", full_name="Root", password_hash=hash_password(PASSWORD),
                    role=Role.SUPER_ADMIN))
        db.commit()
    admin = login_actor(client, "root@wo.local")  # internal domains allowed for CLI-created admins
    r = admin.patch(f"/api/knowledge-base/rules/{rid}", json={"name_en": "Renamed rule"})
    assert r.status_code == 200 and r.json()["version"] == 2
    hist = admin.get(f"/api/knowledge-base/rules/{rid}/history").json()
    assert [h["version"] for h in hist] == [1, 2]
    assert admin.get("/api/admin/stats").status_code == 200
    logs = admin.get("/api/admin/audit-logs?action=kb.").json()
    assert logs["total"] >= 1
