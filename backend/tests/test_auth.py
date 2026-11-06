"""Authentication, registration, tokens, rate limiting, profile."""

import jwt

from tests.conftest import PASSWORD, auth, login_actor, make_actor, register


def test_register_individual_and_company(client):
    ind = register(client, "solo@example.com")
    assert ind["user"]["role"] == "INDIVIDUAL" and ind["user"]["company_id"] is None
    comp = register(client, "boss@example.com", company="Acme Agro")
    assert comp["user"]["role"] == "COMPANY_OWNER" and comp["user"]["company_id"]


def test_password_policy_duplicate_and_company_name(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "password": "short", "full_name": "Aa"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    register(client, "dup@example.com")
    r = client.post("/api/auth/register", json={"email": "DUP@example.com", "password": PASSWORD, "full_name": "Bb"})
    assert r.status_code == 409
    r = client.post("/api/auth/register", json={"email": "c@example.com", "password": PASSWORD, "full_name": "Cc",
                                                "account_type": "company"})
    assert r.status_code == 422


def test_login_wrong_password_and_unknown_user(client):
    register(client, "x@example.com")
    assert client.post("/api/auth/login", json={"email": "x@example.com", "password": "WrongPass999"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}).status_code == 401
    assert login_actor(client, "X@Example.com").user["email"] == "x@example.com"


def test_protected_routes_require_valid_token(client):
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me", headers=auth("garbage")).status_code == 401
    forged = jwt.encode({"sub": "00000000-0000-0000-0000-000000000000", "ver": 0, "exp": 9999999999}, "wrong" * 10,
                        algorithm="HS256")
    assert client.get("/api/users/me", headers=auth(forged)).status_code == 401


def test_logout_revokes_existing_tokens(client):
    a = make_actor(client, "out@example.com")
    assert a.get("/api/users/me").status_code == 200
    assert a.post("/api/auth/logout").status_code == 200
    assert a.get("/api/users/me").status_code == 401


def test_login_rate_limit(client):
    register(client, "rl@example.com")
    codes = [client.post("/api/auth/login", json={"email": "rl@example.com", "password": "WrongPass999"}).status_code
             for _ in range(11)]
    assert codes[-1] == 429


def test_password_change_and_security_headers(client):
    a = make_actor(client, "pw@example.com")
    r = a.patch("/api/users/me", json={"current_password": "WrongPass000", "new_password": "NewStrongPass1"})
    assert r.status_code == 403
    r = a.patch("/api/users/me", json={"current_password": PASSWORD, "new_password": "NewStrongPass1"})
    assert r.status_code == 200
    assert a.get("/api/users/me").status_code == 401  # old token revoked
    assert login_actor(client, "pw@example.com", "NewStrongPass1")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"


def test_errors_never_leak_stack_traces(client):
    r = client.get("/api/farms/not-a-uuid", headers=auth(make_actor(client, "e@example.com").token))
    assert r.status_code == 422
    assert "Traceback" not in r.text and set(r.json()) == {"error"}
