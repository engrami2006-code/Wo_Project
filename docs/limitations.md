# Limitations and Future Work

WO is a course project that demonstrates knowledge-based AI, search and constraint satisfaction on a real domain. It
is not a certified agronomic tool. This page lists, honestly, what the implementation does **not** do and where it
simplifies. Each item names the code that embodies the limitation.

## 1. Agronomy

| Limitation | Detail | Where |
|---|---|---|
| **Kc tables are reference starting points** | The 32 crops use FAO-56 Table 11/12 values for particular regions and planting months (each row's `source_note` says which, e.g. *"Stages: January planting, arid region"*) and ends with *"Values are reference starting points; adjust stage lengths to local planting dates and climate."* Ranges in the table were reduced to midpoints. | `ai/knowledge_base/reference_data.py::_CROPS` |
| **Single crop coefficient only** | No dual coefficient (Kcb + Ke), no soil-evaporation term, no root-zone soil water balance: the daily requirement is ETc − P_eff for that day, with no carry-over of stored soil water, no readily-available-water depletion, no leaching requirement and no salinity effects. | `agronomy/fao56.py::water_requirement` |
| **Daily effective-rain simplification** | P_eff = 0.8 × P uses the 0.8 coefficient of the FAO Training Manual 3 dependable-rainfall formula as a simple daily fraction (the `source` text of the fact says so). Runoff, intensity and soil infiltration are not modelled. | fact `effective_rainfall_fraction` |
| **Perennial Kc simplification** | Perennials follow a 365-day cycle from the planting/cycle start date and use Kc_end after the FAO-56 stages; date palm and alfalfa have no stage lengths and use Kc_mid all year (for alfalfa this ignores the cutting cycles). | `fao56.py::growth_stage`, `seasonal_gross_requirement_l_per_m2` |
| **Climatic adjustment uses forecast daily values** | RHmin and mean wind of the target day (Open-Meteo extended variables) are used for Eq. 62; when they are missing the adjustment is skipped. | `fao56.py::crop_coefficient` |
| **Efficiencies are indicative** | Surface 0.60, sprinkler 0.75, drip 0.90 (FAO TM4) are typical values, not measurements of the user's system; a per-planting override exists. | `IRRIGATION_METHODS` |
| **Seasonal planning water** | Land distribution assumes a constant mean ET0 for the whole season. | `seasonal_gross_requirement_l_per_m2` |
| **Yields are user inputs** | WO does not predict yield; the land-distribution objective uses the yields (and prices) the user enters. Ky is used only as a qualitative percept (`drought_sensitive_crop`). | `schemas/land.py::CandidateCrop` |

## 2. Data and sensing

| Limitation | Detail |
|---|---|
| **No IoT / hardware** | All data comes from user entry and, when available, the weather API. There is no soil-moisture, flow-meter, pH or EC sensor integration. |
| **No soil moisture** | `relative_humidity_2m` is *air* humidity and is never used as soil moisture ([weather.md §6](weather.md#6-air-humidity-is-not-soil-moisture)). |
| **Weather requires internet** | Fresh data needs the Open-Meteo API. Offline, only previously saved snapshots (or manual ET0/precipitation) can be used; a target date outside the saved 3-day forecast makes ET0 and precipitation unknown. Open-Meteo is the only provider implemented (behind the `WeatherProvider` interface). |
| **Event-driven alerts** | Alerts are evaluated when something happens (weather read/refresh, water record, recommendation, hydroponic record, or `POST /api/alerts/evaluate`). There is no background scheduler, so a "missing records" alert appears only at the next evaluation. |
| **Hydroponic reference data** | One reference profile (lettuce, Cornell CEA). Its EC set-point is defined *above source water* (see the profile note); WO compares the recorded EC directly with the configured bounds. No nutrient-dosing calculations. |
| **Measured savings are not normalised** | Measured savings compare L/m²/day of a baseline period with the current window; weather and crop-stage differences between the periods are not normalised (the API note says so). Apparent savings are explicitly *not* proof of savings. |

## 3. AI and algorithms

| Limitation | Detail | Where |
|---|---|---|
| **Propositional, deterministic rules** | No uncertainty model: certainty is `entailed` or `insufficient_data`; input quality is a separate flag. Thresholds are crisp (e.g. 50 % critical ratio). | `explanations/builder.py`, policy facts |
| **Coverage check only for `irrigation_action`** | `COMPLETE_GROUPS = {"irrigation_action"}`. | `knowledge_base/validation.py` |
| **Model checking size limit** | TT-ENTAILS refuses more than 20 symbols; the Logic Lab model-checks only the relevant sub-KB and runs resolution only for ≤ 40 sentences (max 1,500 clauses). | `logic/model_checking.py`, `services/kb_service.py::ask` |
| **KB version number** | `knowledge_bases.version` (reported as `kb_version`) is not incremented by rule/fact edits; per-rule versions and history are kept in `knowledge_rules.version` and `knowledge_rule_history`. Only one active knowledge base is used. | `loader.py::load_knowledge`, `kb_service.py` |
| **Land-distribution tractability** | At most **60 land units** and **6 candidate crops** (schema), plus a 200,000-expansion budget; land is discretised into equal units; one season; no spatial layout, rotation or market constraints. Optimality is relative to the inputs ("Optimal under the selected objective and constraints."). | `schemas/land.py`, `search.py::DEFAULT_NODE_LIMIT` |
| **CSP scheduling model** | One pump with a constant capacity; discrete 15/30/60-minute slots; each task runs contiguously at a constant flow; at most 30 tasks; budget `csp_max_backtracks` (20,000). | `optimization/scheduling/csp.py` |
| **Chatbot vocabulary is pattern-based** | Intents come from fixed AR/EN keyword and phrase lists with a score threshold. There is no spelling correction, no synonym learning, and only simple dates (today/tomorrow/yesterday/ISO dates). Manual offline inputs are recognised only after fixed labels (ET0 / rain / water in English or Arabic) or, when the bot has just asked for weather, as the first two bare numbers. Questions outside the patterns get a fallback with suggestions. Answers are templates; the chatbot does not store recommendations (`persist=False`). | `ai/chatbot/nlu.py`, `services/chatbot_service.py` |

## 4. Platform

| Limitation | Detail |
|---|---|
| **Single-process rate limiter** | The login/registration limiter is in memory (`SlidingWindowRateLimiter`); with several backend processes each has its own counters. A shared store (e.g. Redis) would be needed. |
| **Token handling** | One access token per login (default 2 h), stored in the browser's `localStorage`; no refresh tokens, no multi-factor authentication and no e-mail-based password reset. Revocation is per user (all tokens), via `token_version`. |
| **Synchronous backend** | SQLAlchemy sessions and the Open-Meteo call (timeout 8 s) are synchronous. |

## 5. Verification status (checked 3 October 2026)

The repository has backend tests, Docker files, dependency files, environment templates, setup/dev/test scripts and
a VS Code workspace. See [testing.md](testing.md) and [deployment.md](deployment.md). QA results:

- backend: 88 tests passed on SQLite and on PostgreSQL 16; ruff and mypy clean;
- frontend: 17 tests passed; typecheck, lint and build clean;
- clean install: `scripts/setup.sh` on a fresh copy of the release, against an empty PostgreSQL database and again with `--sqlite`, then `scripts/dev.sh`; a browser check (login → assistant: «هل أسقي الطماطم اليوم؟» → «التبخر 6.2 المطر 0» → «5000 لتر») returned the R-IRR-003 recommendation with no console errors. The Windows `.ps1` scripts were parse-checked with PowerShell 7, not executed on Windows.

What remains **unverified or limited**:

| Item | Status | See |
|---|---|---|
| Docker images (`docker compose up --build`) | **not built**: no Docker daemon was available. `docker compose config` validates the file. | [deployment.md §6](deployment.md#6-docker) |
| Client IP behind nginx in Docker | Done: Compose sets `FORWARDED_ALLOW_IPS: "*"` and nginx overwrites `X-Forwarded-For` with `$remote_addr`, so the backend sees the real client IP and a client cannot spoof it. Not exercised in a running container here (no Docker daemon). | [deployment.md §6.4](deployment.md#64-client-ip-behind-the-proxy) |
| Dependency advisories (`npm audit`) | Production dependencies: 2 moderate advisories in `react-router` 6.x, fixed only in the breaking v7 (open redirect with backslash paths passed to `<Link>`/`useNavigate`, and SSR hydration). WO navigates only to its own constant routes and does not use SSR. The other advisories are in development tooling (Vitest/Vite dev server, Tailwind's file watcher) and are not part of the production bundle. Upgrade path: react-router 7, Vitest 5, Tailwind 4. | `frontend/package.json` |
| Axiom edits | gated only on consistency; an integrity violation caused by an edited axiom is reported by *Validate* but does not block the edit | [knowledge-base.md §7.3](knowledge-base.md#73-editing-a-fact--patch-apiknowledge-basefactsfact_id) |
| `demo_seed` script | manual and optional; exercised by hand (create, re-create, `--remove`) on SQLite, no automated test | [deployment.md §7](deployment.md#7-demo-data-optional) |

## 6. Future work

- Root-zone soil water balance (FAO-56 ch. 8) with soil types, and the dual crop coefficient.
- Optional sensor ingestion (soil moisture, flow meters, pH/EC probes) as an additional percept source.
- A scheduler for periodic alert evaluation and weather refresh.
- More hydroponic reference profiles with sources, and EC relative to source water.
- Normalised impact evaluation (weather-adjusted baselines).
- Larger land-distribution instances (e.g. dynamic programming over the same formulation, or relaxing to integer
  programming) and multi-season planning.
- Shared rate-limit store; refresh tokens; MFA.
- A richer, still deterministic NLU (more patterns, fuzzy matching of crop names, more date expressions).
