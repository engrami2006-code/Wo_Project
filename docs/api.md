# REST API

The backend is a FastAPI application (`backend/app/main.py`) that exposes **82 operations** under the prefix `/api`.
Routers are thin (`backend/app/api/<area>/router.py`); the logic is in `backend/app/services/`.

| Resource | URL (local) |
|---|---|
| Swagger UI | `http://localhost:8000/api/docs` |
| ReDoc | `http://localhost:8000/api/redoc` |
| OpenAPI 3 schema | `http://localhost:8000/api/openapi.json` |

The OpenAPI document groups operations by the tags listed below and declares the error model (`ErrorResponse`) for
401, 403, 404 and 422 on every router (`schemas/common.py::ERROR_RESPONSES`).

---

## 1. Conventions

### 1.1 Authentication

`POST /api/auth/login` (or `register`) returns a JWT. Send it as `Authorization: Bearer <token>` on every other call
except `GET /api/health`. Tokens expire after `JWT_EXPIRE_MINUTES` (default 120) and are revoked by logout, password
change, role change or deactivation ([security.md](security.md#13-revocation-with-token_version)).

### 1.2 Error envelope

Every error — validation, authorisation, not found, conflicts, rate limits and unexpected exceptions — has the same
shape and never contains a stack trace:

```json
{"error": {"code": "not_found", "message": "Farm not found.", "details": null}}
```

| Status | `code` | Typical cause |
|---|---|---|
| 401 | `unauthorized` | missing/invalid/expired/revoked token; wrong login |
| 403 | `forbidden` | resource is visible but the role lacks the permission |
| 404 | `not_found` | resource does not exist **or is not visible to the caller** (isolation) |
| 409 | `conflict` | duplicate e-mail, rule code, member; database integrity error |
| 422 | `validation_error` | Pydantic validation (`details` = list of `{loc, msg, type}`) or a domain rule (`details` may hold a validation report) |
| 429 | `rate_limited` | too many login/registration attempts (`details.retry_after_seconds`) |
| 500 | `database_error` / `internal_error` | unexpected server error (logged, not exposed) |

Real validation error from the running API (`POST /api/farms` with `latitude = 95`):

```json
{"error": {"code": "validation_error", "message": "Request validation failed.",
           "details": [{"loc": ["body", "latitude"], "msg": "Input should be less than or equal to 90",
                        "type": "less_than_equal"}]}}
```

### 1.3 Pagination

Paginated lists accept `?page` (≥ 1, default 1) and `?size` and return

```json
{"items": [...], "total": 42, "page": 1, "size": 20}
```

| Endpoint | Default `size` | Max `size` |
|---|---|---|
| `GET /farms` | 20 | 200 |
| `GET /users`, `/water/records`, `/hydroponics/{id}/records`, `/alerts`, `/admin/audit-logs` | 50 | 200 |
| `GET /recommendations`, `/land-distribution/requests` | 20 | 100 |

Some short lists are not paginated: `GET /water/calculations` takes `limit` (default 50, max 200) and
`GET /weather/{farm_id}/snapshots` takes `limit` (default 10, max 100).

### 1.4 Roles and permissions column

"Any" means any authenticated user; isolation still applies (only visible farms/resources). Farm permissions such as
`farm.update` are defined in `services/access.py` and mapped to roles in [security.md §2](security.md#2-roles-and-permissions).

---

## 2. Endpoints

### Authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public (20/h per IP) | create an `INDIVIDUAL` account, or a `COMPANY_OWNER` with a new company (`account_type="company"`, `company_name`), and sign in (201) |
| POST | `/api/auth/login` | public (10 / 5 min per IP+e-mail) | sign in; returns `access_token`, `token_type`, `expires_in`, `user`. `email` is checked only against the pattern `^[^@\s]+@[^@\s]+$` (not `EmailStr`), so accounts created by the admin script with internal domains such as `admin@wo.local` can sign in ([security.md §1.1](security.md#11-passwords--argon2id)). |
| POST | `/api/auth/logout` | any | revoke **all** tokens of the user (`token_version + 1`) |

### Users

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/users/me` | any | own profile |
| PATCH | `/api/users/me` | any | name, language, password (needs `current_password`) |
| GET | `/api/users` | COMPANY_OWNER (own company), SUPER_ADMIN | list users (paginated) |
| POST | `/api/users` | COMPANY_OWNER (FARM_MANAGER/EMPLOYEE in own company), SUPER_ADMIN | create a user |
| GET | `/api/users/{user_id}` | self, owner of the same company, SUPER_ADMIN (else 404) | get a user |
| PATCH | `/api/users/{user_id}` | COMPANY_OWNER (FARM_MANAGER/EMPLOYEE only), SUPER_ADMIN | rename, change role (FARM_MANAGER ↔ EMPLOYEE), (de)activate |

### Companies

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/companies` | any | companies visible to the caller (admin: all; others: own) |
| POST | `/api/companies` | SUPER_ADMIN | create a company |
| GET | `/api/companies/{company_id}` | own company or SUPER_ADMIN (else 404) | get a company |
| PATCH | `/api/companies/{company_id}` | COMPANY_OWNER (own), SUPER_ADMIN | rename |
| GET | `/api/companies/{company_id}/farms` | own company or SUPER_ADMIN (else 404) | farms of the company that the caller can see |

### Farms & plantings

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/farms` | any | visible farms with counts of plantings, hydroponic systems, open alerts (paginated, `search`) |
| POST | `/api/farms` | INDIVIDUAL, COMPANY_OWNER, SUPER_ADMIN | create a farm (owner/company set from the caller) |
| GET | `/api/farms/{farm_id}` | `farm.read` | get a farm |
| PATCH | `/api/farms/{farm_id}` | `farm.update` | update a farm |
| DELETE | `/api/farms/{farm_id}` | `farm.delete` | delete a farm and all its data (204) |
| GET | `/api/farms/{farm_id}/members` | `farm.read` | users assigned to the farm |
| POST | `/api/farms/{farm_id}/members` | `farm.members` | assign a FARM_MANAGER/EMPLOYEE of the same company |
| DELETE | `/api/farms/{farm_id}/members/{member_id}` | `farm.members` | remove an assignment (`member_id` = user id) |
| GET | `/api/farms/{farm_id}/crops` | `farm.read` | plantings with crop, method and current growth stage |
| POST | `/api/farms/{farm_id}/crops` | `farm.update` | add a planting (area must fit the farm's free area when `total_area_m2` is set) |
| GET | `/api/farm-crops/{planting_id}` | `farm.read` | get a planting |
| PATCH | `/api/farm-crops/{planting_id}` | `farm.update` | update a planting (stage override, method, efficiency, …) |
| DELETE | `/api/farm-crops/{planting_id}` | `farm.update`, not EMPLOYEE | delete a planting |

### Crops (FAO-56 reference)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/crops` | any | reference crops plus the caller's custom crops (`search`) |
| POST | `/api/crops` | INDIVIDUAL, COMPANY_OWNER, FARM_MANAGER, SUPER_ADMIN | add a custom crop; `source` is required |
| GET | `/api/crops/{crop_id}` | visible crop (else 404) | get a crop with `season_length_days` |

### Water management

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/water/records` | any (visible farms) | records with filters `farm_id`, `farm_crop_id`, `date_from`, `date_to` (paginated) |
| POST | `/api/water/records` | `record.create` | record water use; runs the usage-spike and missing-record alert rules |
| DELETE | `/api/water/records/{record_id}` | `record.delete` | delete a record |
| GET | `/api/water/analytics` | any (visible farms) | totals per day/week/month/year, average, min/max, trend, L/m², by farm/crop/source, anomalies — only from real records; statistics need `min_history_days` |
| POST | `/api/water/calculations` | `ai.run` | FAO-56 requirement for a planting, stored with inputs, parameters and steps |
| GET | `/api/water/calculations` | any (visible farms) | calculation history (`farm_id`, `farm_crop_id`, `limit`) |
| POST | `/api/water/baselines` | `farm.update` | record a measured baseline period |
| GET | `/api/water/baselines?farm_id=` | `farm.read` | baselines of a farm |
| GET | `/api/water/impact?farm_id=` | `farm.read` | measured vs apparent savings (see [§4](#4-impact-endpoint-and-the-four-quantities)) |

### Smart irrigation

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/irrigation/methods` | any | irrigation methods with sourced efficiency |
| POST | `/api/irrigation/recommendation` | `ai.run` | run the KB agent for one planting; returns the explanation contract; persists a recommendation, the calculation and alerts unless `persist=false` |
| POST | `/api/irrigation/schedule` | `ai.run` for the given farm/plantings | CSP schedule (AC-3, MRV, LCV, forward checking) — [csp.md](csp.md) |

### Hydroponics

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/hydroponics/profiles` | any | reference pH/EC profiles with sources |
| GET | `/api/hydroponics` | any (visible farms, optional `farm_id`) | systems with latest record and record count |
| POST | `/api/hydroponics` | `farm.update` | create a system (optional `profile_code`) |
| GET | `/api/hydroponics/{system_id}` | `farm.read` | get a system |
| PATCH | `/api/hydroponics/{system_id}` | `farm.update` | update a system / apply a profile |
| DELETE | `/api/hydroponics/{system_id}` | `farm.delete` | delete a system and its records |
| GET | `/api/hydroponics/{system_id}/records` | `farm.read` | records (paginated) |
| POST | `/api/hydroponics/{system_id}/records` | `record.create` | add a record → water balance, water record, KB evaluation, alerts, recommendation |
| GET | `/api/hydroponics/{system_id}/balance` | `farm.read` | balance per record, totals, configured ranges, evaluation |
| GET | `/api/hydroponics/{system_id}/evaluation` | `farm.read` | run the KB agent on the system now (nothing stored) |

### Weather (Open-Meteo, offline fallback)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/weather/{farm_id}` | `farm.read` | fresh weather if online, otherwise the latest snapshot; status `fresh`/`cached`/`unavailable`; evaluates weather alerts |
| POST | `/api/weather/{farm_id}/refresh` | `farm.read` | force a provider request (same fallback) |
| GET | `/api/weather/{farm_id}/snapshots` | `farm.read` | saved snapshots, newest first (`limit`) |

### Dashboard & analytics

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/dashboard/summary` | any (visible farms) | counts, last-30-day water, crop distribution, alerts, latest recommendations, weather and hydroponic status; `{"empty": true}` when the workspace has no farm |
| GET | `/api/analytics/overview` | any (visible farms, optional `farm_id`) | monthly water analytics plus per-system hydroponic totals |

### Alerts

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/alerts` | any (visible farms) | alerts with filters `farm_id`, `status`, `severity` (paginated) |
| PATCH | `/api/alerts/{alert_id}` | `record.create` | acknowledge or resolve |
| POST | `/api/alerts/evaluate?farm_id=` | `ai.run` | run the alert rules for a farm now (weather, usage, missing records) |

### Recommendations

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/recommendations` | any (visible farms) | history with filters `farm_id`, `kind` (payload omitted) |
| GET | `/api/recommendations/{rec_id}` | `farm.read` | one recommendation with its full explanation (`payload`) |
| PATCH | `/api/recommendations/{rec_id}` | `record.create` | set status `new`/`accepted`/`dismissed` |

### Chatbot (deterministic, KB-backed)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/chatbot/query` | any (own data only) | `{message, session_id?, language?, et0_override_mm?, precipitation_override_mm?, available_water_l?}` → `{session_id, intent, language, text, status, options, explanation, nlu}`; `status` ∈ `answer`, `clarification`, `missing_data`, `fallback`. The optional manual inputs are for offline use: `et0_override_mm` 0–30, `precipitation_override_mm` 0–1000, `available_water_l` ≥ 0. The same values can be typed as labelled numbers ("ET0 6.2 rain 0", «التبخر 6.2 المطر 0», «الماء 5000»); explicit fields take precedence ([ai.md §9.4](ai.md#94-dialogue-state-and-slot-filling)). `nlu.entities.manual_inputs` echoes the values in use. |
| GET | `/api/chatbot/sessions/{session_id}` | session owner (else 404) | conversation history |

### Knowledge base & logic

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/knowledge-base` | any | overview: version, rule counts by category, fact counts by kind, percept count, action groups, pipeline |
| GET | `/api/knowledge-base/facts` | any | parameters, policy thresholds, axioms (`kind` filter) |
| PATCH | `/api/knowledge-base/facts/{fact_id}` | SUPER_ADMIN | edit a parameter or axiom (validated, versioned, audited) |
| GET | `/api/knowledge-base/rules` | any | rules (`category` filter) |
| POST | `/api/knowledge-base/rules` | SUPER_ADMIN | add a rule — rejected with the validation report if it makes the KB invalid |
| GET | `/api/knowledge-base/rules/{rule_id}` | any | one rule |
| PATCH | `/api/knowledge-base/rules/{rule_id}` | SUPER_ADMIN | edit / (de)activate a rule (validated, versioned, audited) |
| GET | `/api/knowledge-base/rules/{rule_id}/history` | any | version history |
| GET | `/api/knowledge-base/percepts` | any | percept catalog |
| POST | `/api/knowledge-base/validate` | any | model-check the KB (optionally with a candidate rule) — [logic.md §6](logic.md#6-knowledge-base-validation) |
| POST | `/api/knowledge-base/ask` | any | Logic Lab: TELL percepts, ASK a sentence with FC, BC, TT-ENTAILS, DPLL, resolution — [logic.md §7](logic.md#7-logic-lab-endpoint) |

### Land distribution (search)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/land-distribution/optimize` | any (`ai.run` on `farm_id` when given) | A\* allocation with BFS/UCS/Greedy comparison — [search.md](search.md) |
| GET | `/api/land-distribution/requests` | any (own requests and requests of visible farms) | previous requests with status and objective value (paginated) |
| GET | `/api/land-distribution/requests/{request_id}` | creator or visible farm (else 404) | one request with its result |

### Administration

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/admin/audit-logs` | SUPER_ADMIN (all), COMPANY_OWNER (own company) | audit trail with `action` prefix and `user_id` filters (paginated) |
| GET | `/api/admin/stats` | SUPER_ADMIN | counts of users, companies, farms, water records, recommendations, rules |

### System

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | `{status: ok/degraded, database: bool, version: "2.0.0", weather_offline_mode: bool}` |

---

## 3. Real examples

The following requests were sent to the running API (PostgreSQL, weather offline mode on) and the responses are copied
verbatim, except that the token is shortened.

### 3.1 Login

```http
POST /api/auth/login
Content-Type: application/json

{"email": "owner@test.com", "password": "StrongPass123"}
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5…",
  "token_type": "bearer",
  "expires_in": 7200,
  "user": {
    "id": "ad2a0cc3-45f8-44ab-b854-5ee3f6db30da",
    "email": "owner@test.com",
    "full_name": "Owner One",
    "role": "COMPANY_OWNER",
    "company_id": "3af1827a-48da-4d81-8602-7f1dd57c84b7",
    "is_active": true,
    "preferred_language": "ar",
    "created_at": "2026-10-03T04:22:09.271468+03:00",
    "last_login_at": "2026-10-03T02:50:44.938932Z"
  }
}
```

### 3.2 Paginated list

```http
GET /api/farms?page=1&size=2
Authorization: Bearer <token>
```

```json
{
  "items": [
    {
      "id": "b28dbdd5-4b4d-41b7-80b1-a8cbde0f8696",
      "name": "Wadi Farm",
      "company_id": "3af1827a-48da-4d81-8602-7f1dd57c84b7",
      "owner_user_id": null,
      "latitude": 21.5,
      "longitude": 39.2,
      "location_name": null,
      "total_area_m2": 20000.0,
      "water_source": "well",
      "daily_water_allowance_l": 3000.0,
      "notes": null,
      "is_demo": false,
      "created_at": "2026-10-03T04:22:29.762196+03:00",
      "updated_at": "2026-10-03T04:22:29.762198+03:00",
      "plantings_count": 2,
      "hydro_systems_count": 1,
      "open_alerts": 3
    }
  ],
  "total": 1,
  "page": 1,
  "size": 2
}
```

### 3.3 Irrigation recommendation (abridged)

```http
POST /api/irrigation/recommendation
Authorization: Bearer <token>
Content-Type: application/json

{"farm_crop_id": "a6cc9fb7-c375-408d-80e1-4cbd5690884c", "target_date": "2026-10-03",
 "available_water_l": 3000, "et0_override_mm": 6.0, "precipitation_override_mm": 0, "persist": false}
```

The response has the keys `status`, `recommendation_id`, `explanation`, `weather_status`, `alerts_created`; the
`explanation` object has `recommendation`, `reason_en`, `reason_ar`, `supporting_facts`, `triggered_rules`,
`advisories`, `alerts`, `alternatives`, `what_could_change`, `missing_data`, `calculation`, `certainty`,
`data_quality`, `kb_version`, `trace`, `percepts`, `fired_codes` and `context`. Selected values:

```json
{
  "status": "recommendation",
  "recommendation_id": null,
  "weather_status": "unavailable",
  "alerts_created": 0,
  "explanation": {
    "recommendation": {
      "action": "action_critical_supply",
      "rule": "R-IRR-004",
      "title_en": "Critical water shortage",
      "title_ar": "نقص حرج في المياه",
      "text_en": "Critical shortage: apply the available 3,000 L (39% of need) and prioritise this planting only if it is the most sensitive.",
      "text_ar": "نقص حرج: استخدم المتاح 3,000 لتر (39% من الاحتياج) وقدّم هذه الزراعة فقط إن كانت الأكثر حساسية.",
      "amount_l": 3000.0
    },
    "reason_en": "The crop is in season, ETc (6.90 mm) is positive and effective rain (0.00 mm) does not cover it. Available water is below 50% of the gross requirement (7,666.7 L).",
    "certainty": "entailed",
    "data_quality": "manual_et0",
    "kb_version": 1,
    "calculation": {
      "method": "FAO-56 single crop coefficient",
      "result": {"kc": 1.15, "kc_climate_adjusted": false, "et0_mm": 6.0, "etc_mm": 6.9, "p_eff_mm": 0.0,
                 "nir_mm": 6.9, "net_l": 6900.0, "gross_l": 7666.67, "coverage_pct": 39.1}
    },
    "trace": {
      "conflict_resolution": [{"group": "irrigation_action", "winner": "R-IRR-004",
                               "candidates": ["R-IRR-004"], "overridden": []}],
      "blocked": []
    },
    "fired_codes": ["R-ALR-001", "R-IRR-001", "R-ADV-003", "R-ALR-005", "R-IRR-004", "R-ALR-006", "R-IRR-010"]
  }
}
```

`alerts_created` is 0 because `persist=false` skips persistence; with `persist=true` the same call stores the
recommendation, the calculation and the alerts. A full walk-through of an explanation is in
[ai.md §10](ai.md#10-fully-worked-example-computed-with-the-code); a full Logic Lab response is summarised in
[logic.md §5.3](logic.md#53-a-real-logic-lab-run).

### 3.4 Errors

```http
GET /api/farms/00000000-0000-0000-0000-000000000000      → 404
{"error":{"code":"not_found","message":"Farm not found.","details":null}}

GET /api/users/me   (no Authorization header)            → 401
{"error":{"code":"unauthorized","message":"Authentication required.","details":null}}
```

---

## 4. Impact endpoint and the four quantities

`GET /api/water/impact?farm_id=` (`water_service.impact`) keeps four quantities separate and never presents a
calculated number as a saving:

| Field | Meaning |
|---|---|
| `calculated_requirement_l` | sum of the latest FAO-56 gross requirement per planting and day (stored calculations in the window) |
| `actual_usage_l` | recorded water use on those planting-days |
| `apparent_savings_l` | calculated − actual, with the note *"Apparent savings compare the calculated requirement with recorded use. They may reflect under-irrigation or unrecorded use and are NOT proof of real savings."* |
| `measured_savings_pct` | only with a **measured baseline** (`water_baselines`) and at least `min_history_days` days of records in the current window: (baseline L/m²/day − current L/m²/day) / baseline × 100, noting that weather and crop-stage differences are not normalised. Without a baseline: *"Not available — record a measured baseline period first."* |
