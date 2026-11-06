# Security

Security is enforced by the **backend**; the frontend only reflects it (for example by hiding the Admin page from
roles that cannot use it). This document describes authentication, authorisation (roles and resource isolation),
transport and input protections, error handling, auditing and secret management, with the code that implements each.

| Concern | Code |
|---|---|
| Password hashing, JWT | `backend/app/core/security.py` |
| Current user, token checks | `backend/app/core/deps.py` |
| Roles, permissions, isolation | `backend/app/services/access.py` (+ role checks in services) |
| Login/logout, rate limiting | `backend/app/services/auth_service.py`, `backend/app/core/middleware.py` |
| Security headers, CORS | `backend/app/core/middleware.py`, `backend/app/main.py`, `frontend/nginx.conf` |
| Error envelope | `backend/app/core/errors.py` |
| Audit log | `backend/app/services/audit.py`, table `audit_logs` |
| Structured logs | `backend/app/core/logging.py` |
| Settings / secrets | `backend/app/core/config.py` |

---

## 1. Authentication

### 1.1 Passwords — Argon2id

`security.py` uses `argon2.PasswordHasher()` with the library defaults (the comment notes the RFC 9106 low-memory
profile). With the installed `argon2-cffi` 25.1 this is **Argon2id**, time cost 3, memory 64 MiB (65,536 KiB),
parallelism 4 — hashes look like `$argon2id$v=19$m=65536,t=3,p=4$…`. `verify_password` returns `False` on mismatch or
on an invalid hash.

Password policy (`schemas/auth.py::_password_policy`): at least 10 characters, at least one letter and one digit,
at most 128 characters. E-mails are stripped and lower-cased before lookup.

E-mail validation differs by endpoint (`schemas/auth.py`):

| Request | `email` field | Why |
|---|---|---|
| `RegisterRequest` | Pydantic `EmailStr` (strict, needs `email-validator`) | self-registered accounts must have a real-looking address |
| `LoginRequest` | plain string, 3–320 characters, pattern `^[^@\s]+@[^@\s]+$` | accounts created with the admin script can use internal domains (e.g. `admin@wo.local`) that `EmailStr` rejects; an unknown address simply fails with 401 |

To keep response times similar, a login for an unknown e-mail still verifies the password against a constant dummy
hash (`_DUMMY_HASH`) before returning *"Invalid e-mail or password."* — the same message as for a wrong password.

### 1.2 JWT access tokens

| Property | Value |
|---|---|
| Algorithm | HS256 (`JWT_ALGORITHM`) |
| Secret | `JWT_SECRET` from the environment; the app refuses to start if it is shorter than 32 characters (`Settings.validate_runtime`) |
| Lifetime | `JWT_EXPIRE_MINUTES` (default 120 → `expires_in = 7200` s) |
| Claims | `sub` (user id), `role`, `ver` (token version), `iat`, `exp`, `jti` (random) |
| Required on decode | `sub`, `exp`, `ver` |
| Transport | `Authorization: Bearer <token>` |

The frontend keeps the token in `localStorage` (`frontend/src/hooks/useAuth.tsx`) and sends it from the API client
(`frontend/src/services/api.ts`); on a 401 for an authenticated request it signs the user out. Because the token is
readable by scripts on the page, the nginx Content-Security-Policy (§5) only allows scripts from the same origin.

`deps.py::get_current_user` rejects (401 *"Invalid or expired token."*) a missing/non-Bearer header, a bad signature or
expired token, an unknown or **inactive** user, and a token whose `ver` differs from the user's current
`token_version`.

### 1.3 Revocation with `token_version`

Stateless JWTs are revoked by incrementing `users.token_version`; every token issued before the increment stops
working immediately. The version is incremented on:

| Event | Code |
|---|---|
| Logout (`POST /api/auth/logout`) — revokes **all** of the user's tokens | `auth_service.logout` |
| Own password change (`PATCH /api/users/me` with `current_password` + `new_password`) | `auth_service.update_profile` |
| Role change or deactivation by an owner/admin | `user_service.update_user` |
| Promotion/password reset with the super-admin script | `scripts/create_superadmin.py` |

---

## 2. Roles and permissions

### 2.1 Roles

| Role | Scope |
|---|---|
| `INDIVIDUAL` | own farms only (farms with `owner_user_id = user` and no company) |
| `COMPANY_OWNER` | every farm of the own company; manages the company's users and farm assignments |
| `FARM_MANAGER` | company farms they are assigned to (`farm_members`) |
| `EMPLOYEE` | company farms they are assigned to; records and AI only |
| `SUPER_ADMIN` | everything; knowledge-base editing; platform administration |

Registration creates either an `INDIVIDUAL` or a `COMPANY_OWNER` with a new company. Other roles are created by an
owner or admin (`POST /api/users`); a `SUPER_ADMIN` can only be created with the script (see
[deployment.md](deployment.md#5-create-a-super-admin)).

### 2.2 Farm permissions (`access.py::FARM_ROLE_PERMS`)

| Permission | Used for | INDIVIDUAL | COMPANY_OWNER | FARM_MANAGER | EMPLOYEE | SUPER_ADMIN |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `farm.read` | read a farm and everything on it | ✓ | ✓ | ✓ | ✓ | ✓ |
| `farm.update` | edit farm; create/edit/delete plantings; create/edit hydroponic systems; create baselines | ✓ | ✓ | ✓ | — | ✓ |
| `farm.delete` | delete a farm or a hydroponic system | ✓ | ✓ | — | — | ✓ |
| `farm.members` | assign/remove farm managers and employees | — | ✓ | — | — | ✓ |
| `record.create` | water records, hydroponic records, acknowledge/resolve alerts, accept/dismiss recommendations | ✓ | ✓ | ✓ | ✓ | ✓ |
| `record.delete` | delete a water record | ✓ | ✓ | ✓ | — | ✓ |
| `ai.run` | irrigation recommendation, FAO-56 calculation, CSP schedule, alert evaluation, land distribution for a farm | ✓ | ✓ | ✓ | ✓ | ✓ |

### 2.3 Other role checks

| Action | Allowed roles | Code |
|---|---|---|
| Create a farm | INDIVIDUAL (own), COMPANY_OWNER (company), SUPER_ADMIN | `CAN_CREATE_FARM`, `farm_service.create_farm` |
| Create a custom crop | INDIVIDUAL, COMPANY_OWNER, FARM_MANAGER, SUPER_ADMIN | `CAN_CREATE_CROP` |
| List / create / update users | COMPANY_OWNER (own company; may create and modify only FARM_MANAGER and EMPLOYEE), SUPER_ADMIN (all) | `CAN_MANAGE_USERS`, `user_service` |
| Deactivate own account | nobody (403) | `user_service.update_user` |
| Create a company | SUPER_ADMIN | `user_service.create_company` |
| Rename a company | COMPANY_OWNER (own), SUPER_ADMIN | `user_service.update_company` |
| Edit KB rules, parameters, axioms | SUPER_ADMIN | `kb_service` (`ensure_role`) |
| Read the audit log | SUPER_ADMIN (all), COMPANY_OWNER (own company) | `api/admin/router.py::audit_logs` |
| Platform statistics | SUPER_ADMIN | `api/admin/router.py::stats` |

Reading the crop library, irrigation methods, hydroponic profiles and the knowledge base (rules, facts, percepts,
validate, Logic Lab) is open to every authenticated user; reference data is global, not tenant data.

---

## 3. Resource isolation: 404, not 403

`access.py::farm_visibility(user)` is a SQL condition that selects the farms a user may see:

```text
SUPER_ADMIN    → all farms
INDIVIDUAL     → owner_user_id = user.id AND company_id IS NULL
no company     → no farms
COMPANY_OWNER  → company_id = user.company_id
FARM_MANAGER / EMPLOYEE → company_id = user.company_id AND id IN (their farm_members rows)
```

`get_farm(db, user, farm_id, perm)` applies it in the query itself:

1. farm **not visible** → `404 not_found` *"Farm not found."* — the response is identical to a farm that does not
   exist, so the existence of other companies' resources is not leaked;
2. farm visible but the role lacks `perm` → `403 forbidden` *"Your role (EMPLOYEE) cannot perform 'farm.delete'."*.

Every farm-scoped resource is resolved through its farm: plantings (`get_planting`), hydroponic systems
(`get_system`), water records, recommendations, alerts, calculations, baselines, weather. Lists are filtered with
`visible_farm_ids`. Other tenant objects follow the same rule: users (`can_see_user`), companies, land-distribution
requests (creator or visible farm) and chat sessions (owner only) all return 404 when not visible. When a request body
references a planting or hydroponic system, the service also checks that it belongs to the same farm
(*"Planting not found on this farm."*).

Real response from the running API for an unknown farm id (identical for another company's farm):

```http
HTTP/1.1 404 Not Found
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: no-referrer
permissions-policy: camera=(), microphone=(), geolocation=()
cross-origin-opener-policy: same-origin

{"error":{"code":"not_found","message":"Farm not found.","details":null}}
```

---

## 4. Rate limiting

`middleware.py::SlidingWindowRateLimiter` keeps, per key, the timestamps of recent attempts (thread-safe, in memory).

| Limiter | Key | Limit |
|---|---|---|
| Login | `login:<ip>:<email>` | `LOGIN_RATE_LIMIT_ATTEMPTS` (10) per `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (300 s); cleared after a successful login |
| Registration | `register:<ip>` | 20 per hour |

Exceeding a limit returns `429 rate_limited` *"Too many attempts. Please try again later."* with
`details.retry_after_seconds`. The limiter lives in the process memory: it is suitable for a single backend process; a
multi-instance deployment would need a shared store (the class docstring says so — see
[limitations.md](limitations.md)).

`<ip>` is `request.client.host` (`deps.py::client_ip`). In Docker, Compose sets `FORWARDED_ALLOW_IPS: "*"` so that
uvicorn replaces the nginx address with the address from `X-Forwarded-For`, and `frontend/nginx.conf` overwrites
that header with `$remote_addr` (it never appends to a client-supplied value), so the client cannot choose the IP
part of these keys. See [deployment.md §6.4](deployment.md#64-client-ip-behind-the-proxy).

## 5. HTTP headers and CORS

`SecurityHeadersMiddleware` adds to every API response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
`Cross-Origin-Opener-Policy: same-origin`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` when
`ENABLE_HSTS=true` (enable it only behind HTTPS).

The nginx configuration that serves the frontend (`frontend/nginx.conf`) adds a Content-Security-Policy
(`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self';
connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), `X-Frame-Options`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `server_tokens off` and a 2 MB request body
limit.

CORS (`main.py`): origins from `CORS_ORIGINS` (comma-separated; default `http://localhost:5173,http://127.0.0.1:5173,
http://localhost:8080`), `allow_credentials=False` (tokens travel in the `Authorization` header, not cookies), methods
`GET, POST, PATCH, DELETE, OPTIONS`, headers `Authorization, Content-Type, Accept-Language`. In Docker the browser talks
to the API through the same origin (`/api` proxied by nginx), so CORS is not involved.

## 6. Input validation and queries

- Every request body and query parameter is validated by Pydantic v2 schemas (`backend/app/schemas/`): ranges
  (latitude −90…90, longitude −180…180, area > 0, efficiency in (0, 1], pH 0–14, EC 0–20, page sizes ≤ 200, …),
  lengths, enums and cross-field rules (`model_validator`).
- The database repeats the essential checks as `CHECK` constraints (see [database.md](database.md)).
- All queries use SQLAlchemy expressions with bound parameters; no SQL is built by string concatenation of user input.
- Records cannot be dated more than 5 minutes in the future; a reservoir level cannot exceed 105 % of capacity.

## 7. Error handling

`errors.py` registers handlers so that every error uses the envelope
`{"error": {"code", "message", "details"}}` and **no stack trace** is ever returned:

| Source | Status / code |
|---|---|
| `NotFoundError` / `ForbiddenError` / `UnauthorizedError` / `ConflictError` / `ValidationAppError` / `RateLimitError` / `ExternalServiceError` | 404 `not_found` / 403 `forbidden` / 401 `unauthorized` / 409 `conflict` / 422 `validation_error` / 429 `rate_limited` / 502 `external_service_error` |
| `RequestValidationError` (Pydantic) | 422 `validation_error`, *"Request validation failed."*, `details = [{loc, msg, type}]` |
| Starlette `HTTPException` | its status, code `unauthorized`/`forbidden`/`not_found`/`method_not_allowed`/`http_error` |
| `IntegrityError` | 409 `conflict`, *"The request conflicts with existing data."* (logged with the first 200 chars of the DB message) |
| other `SQLAlchemyError` | 500 `database_error` |
| any other exception | 500 `internal_error`, *"An unexpected error occurred."* (logged with the exception type) |

## 8. Audit log

`audit.py::audit(db, user, action, entity_type, entity_id, details, ip)` inserts an `audit_logs` row (user, company,
action, entity, details, client IP, time) and emits a JSON log line. Keys named `password`, `password_hash`, `token`,
`access_token` or `secret` are removed from `details`.

Actions recorded in the code:

| Area | Actions |
|---|---|
| Authentication & users | `auth.login`, `auth.login_failed`, `auth.logout`, `user.register`, `user.create`, `user.update`, `user.password_change` |
| Companies & farms | `company.create`, `company.update`, `farm.create`, `farm.update`, `farm.delete`, `farm.member_add`, `farm.member_remove` |
| Crops & plantings | `crop.create`, `planting.create`, `planting.update`, `planting.delete` |
| Water | `water_record.create`, `water_record.delete`, `calculation.create`, `baseline.create` |
| Hydroponics | `hydro_system.create`, `hydro_system.update`, `hydro_system.delete`, `hydro_record.create` |
| AI & decisions | `recommendation.create`, `recommendation.status`, `alerts.evaluate`, `alert.acknowledged`, `alert.resolved`, `irrigation.schedule`, `land_distribution.optimize` |
| Knowledge base | `kb.rule_create`, `kb.rule_update`, `kb.fact_update` |

`GET /api/admin/audit-logs` (filters `action` prefix, `user_id`, pagination) shows them to super admins (all) and
company owners (own company).

## 9. Logs and secrets

- Logs are single-line JSON (`logging.py::JsonFormatter`: `ts`, `level`, `logger`, `msg` and extra fields). Extra fields
  named `password`, `password_hash`, `token`, `access_token`, `jwt_secret` or `authorization` are replaced by `***`.
- Secrets come only from the environment (or a local `.env` that is not committed; `.gitignore` excludes `.env`,
  `backend/.env` and `frontend/.env`): `JWT_SECRET`, `DATABASE_URL`, and `POSTGRES_PASSWORD` for Docker Compose.
  The default `JWT_SECRET` is empty, so the API does not start until a real secret (≥ 32 characters) is configured.
  The setup scripts generate one with `secrets.token_urlsafe(48)`. Docker Compose refuses to start without
  `JWT_SECRET` and `POSTGRES_PASSWORD` (see [deployment.md](deployment.md#3-environment-variables)).
- No external AI or analytics service receives data; the only outbound call is the Open-Meteo forecast request with
  the farm's coordinates.
