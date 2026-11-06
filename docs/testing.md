# Testing

This page describes WO's automated tests, how to run them, how they cover the specification
(`prompt/MASTER_PROMPT_v2.md` §18), and the results of the QA run on 2026-10-03 (§6).

## 1. Overview

| Suite | Location | Runner | Size |
|---|---|---|---|
| Backend unit, API and integration tests | `backend/tests/` (15 test modules + `conftest.py`) | pytest 9.1 (config in `backend/pyproject.toml`) | 88 tests |
| Frontend unit and component tests | `frontend/src/__tests__/` (8 files) | Vitest 2.1 + Testing Library + jsdom | 17 tests |
| Backend static checks | `backend/pyproject.toml` | ruff 0.16 (lint), mypy 2.4 (types of the AI core) | — |
| Frontend static checks and build | `frontend/package.json` | `tsc` (`typecheck`), ESLint (`lint`), `vite build` | — |

All of it runs with one command:

```bash
./scripts/test.sh                                            # macOS / Linux
powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1  # Windows
```

The script runs, in order, and stops at the first failure:

1. backend: `ruff check .` → `mypy` → `python -m pytest`;
2. frontend: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.

In VS Code, the same script is the default test task **test: everything**. The launch configuration
**Backend: pytest (current file)** debugs a single test module.

## 2. Backend tests (pytest)

### 2.1 Running

```bash
cd backend && . .venv/bin/activate          # Windows: .\.venv\Scripts\Activate.ps1
python -m pytest                            # SQLite (default), 88 tests
TEST_DATABASE_URL=postgresql+psycopg://wo:wo_dev_password@localhost:5432/wo_test python -m pytest   # PostgreSQL
python -m pytest tests/test_search.py -k admissible                                                 # a subset
```

PowerShell: `$env:TEST_DATABASE_URL="postgresql+psycopg://…/wo_test"; python -m pytest`.

Use a dedicated, disposable PostgreSQL database (`createdb -O wo wo_test`). The fixture below drops and recreates
every table before each test. `pyproject.toml` sets `testpaths = ["tests"]` and `addopts = "-q"`, and ignores
`DeprecationWarning`.

### 2.2 How the test environment is built (`tests/conftest.py`)

- **Environment before import.** `core/database.py` creates the engine when it is imported, so `conftest.py` sets the
  environment first:
  - `DATABASE_URL` = `TEST_DATABASE_URL` if set, otherwise an SQLite file in a new temporary directory;
  - `JWT_SECRET` = a fixed 52-character test secret;
  - `WEATHER_OFFLINE_MODE=false`, `ENVIRONMENT=test`, `LOG_LEVEL=WARNING`.

  Only then does it import the app.
- **Fresh database per test** (autouse fixture `fresh_database`):
  1. `Base.metadata.drop_all` / `create_all`;
  2. `seed_reference_knowledge(db)`, the same function migration 0002 calls;
  3. reset the login and registration rate limiters.

  No test depends on another test's data.
- **No network.** The weather provider is replaced by `OfflineProvider`, which always raises
  `WeatherUnavailableError`. Tests that need weather install `FakeProvider(et0, rain)`, a deterministic 3-day forecast
  starting today. The Open-Meteo provider itself is tested at the HTTP level with `respx` against a fake URL.
- **Helpers:**
  - `register`, `make_actor`, `login_actor`: an `Actor` wraps a `TestClient` with the bearer token;
  - fixtures `owner` and `other_owner`: two company owners in different companies;
  - `create_farm`, `create_planting`, `crop_id`, `method_id`.

### 2.3 What each module tests

| Module | Tests | What it checks |
|---|---|---|
| `test_logic.py` | 10 | parser precedence as in Russell & Norvig, right-associative `⇒`, word operators, parse errors; evaluation and round trip; CNF of `⇔`; TT-ENTAILS (modus ponens, counterexample, 20-symbol limit); DPLL (SAT, UNSAT, entailment); resolution proves and refuses; model checking proves by cases where Horn chaining cannot |
| `test_inference.py` | 8 | rules must be Horn; forward-chaining agenda and known-false literals; conflict resolution priority → specificity → code; overridden actions block their consequences; real-KB paths (deficit, full, critical, postpone, season ended); backward chaining proven / unknown / disproven; forward and backward chaining agree on reference scenarios |
| `test_kb_validation.py` | 5 | the reference KB is consistent, error-free and complete (`coverage_complete`); an equal-priority overlap is a `conflict` with a witness model; dead rule, negation on a derived symbol, unknown symbol, subsumption; inconsistent axioms are detected; `integrity_violation` (error) with a witness model that derives both `irrigate_today` and `skip_irrigation_today` (`test_integrity_constraint_violation_is_reported_with_a_witness`) |
| `test_fao56.py` | 13 | stage boundaries (8 parametrised cases, including not yet planted and season ended); Kc interpolation (Eq. 66); wind conversion (Eq. 47) and climatic adjustment (Eq. 62); hand-computed water requirement; rain covering demand → 0 and input validation; seasonal requirement and perennials |
| `test_hydro_balance.py` | 2 | complete balance; missing terms are reported, never assumed |
| `test_search.py` | 6 | A\* = UCS cost with no more expansions on 60 random instances per objective (seed 42); the heuristic is admissible on every reachable state of random instances (both objectives); BFS and greedy are not guaranteed optimal; infeasible minimums are explained |
| `test_csp.py` | 3 | the solution respects pump capacity, window and blocked hours; AC-3 builds binary no-overlap constraints; infeasible cases name the violated constraint |
| `test_nlu.py` | 3 | Arabic normalisation (tashkeel, tatweel, alef, Arabic digits); intents in Arabic and English, no intent for nonsense; entities (dates, `2.5 m3`, `5,000 L`, labelled «التبخر 6.2 المطر 0» and `ET0=5.5, rain 3`, crop candidates) |
| `test_weather.py` | 6 | provider parses and validates (respx); retry with core variables after HTTP 400; implausible values and offline are rejected; service fresh → cached → unavailable; stale snapshot flagged; air humidity never used as soil moisture |
| `test_auth.py` | 8 | registration (individual, company); password policy, duplicate e-mail, company name; wrong password / unknown user = 401; e-mail case-insensitive; invalid or forged tokens; logout revokes tokens; login rate limit → 429; password change revokes old tokens; security headers; errors never leak stack traces |
| `test_authorization.py` | 5 | IDOR: another company gets **404 on 18 endpoints** (farms, plantings, company, hydroponics, water records, weather, recommendations, alerts, irrigation, calculations, analytics, alert evaluation), and lists are scoped; individual users are isolated; employee permissions and farm assignment (403 on delete/edit/admin); an owner cannot create a `SUPER_ADMIN` or see other companies' users; only a `SUPER_ADMIN` edits the KB (a CLI-style admin `root@wo.local` logs in) |
| `test_api_flows.py` | 11 | empty workspace shows no numbers; farm/planting CRUD with validation (latitude, area > farm, zero area, stage override); traceable calculation and missing data; full explanation contract of an irrigation recommendation (R-IRR-003, `manual_et0`, alternatives, what could change, trace, stored payload, alerts R-ALR-005 / R-ALR-001); no weather → insufficient data; online weather with rain → postpone; water records → spike alert de-duplicated, future record rejected, analytics and dashboard; impact needs a measured baseline; hydroponic balance, ranges, alerts, auto-resolve and `data_quality = "measured"`; no configured ranges → no pH alert; a system **without records** (balance `has_data = false`, *"No hydroponic records yet."*, no recommendation, percept `hydro_records_missing` true, 0 records) |
| `test_ai_endpoints.py` | 5 | chatbot slot filling in Arabic with offline weather (asks for ET0/rain, then water, answers R-IRR-003, explains "ليش؟"); English disambiguation between two plantings, explicit manual inputs, no answer invented for a user without plantings, fallback; land distribution endpoint (A\* = UCS, admissible heuristic, infeasible, 422 without ET0, history); schedule endpoint (solved, infeasible `pump_capacity`); Logic Lab agreement and validation (`coverage_complete`, candidate `conflict`) |
| `test_migrations.py` | 1 | `alembic upgrade head` on a fresh SQLite file: 39 rules, ≥ 30 crops, 3 irrigation methods, 0 users / farms / water records |
| `test_no_ml.py` | 2 | `requirements.txt` contains no ML / LLM / computer-vision package, and no module under `app/` imports one |

### 2.4 Coverage of specification §18

| §18 requirement | Test(s) |
|---|---|
| auth | `test_auth.py` (all) |
| RBAC | `test_authorization.py::test_employee_permissions_and_assignment`, `::test_owner_cannot_create_admin_or_touch_other_company_users`, `::test_only_super_admin_edits_the_knowledge_base` |
| parameterised IDOR across all resources | `test_authorization.py::test_other_company_gets_404_everywhere` (18 requests in one test, not a `pytest.mark.parametrize`), `::test_individual_users_are_isolated` |
| CRUD | `test_api_flows.py::test_farm_and_planting_crud_with_validation` |
| FAO-56 math | `test_fao56.py` (13), `test_api_flows.py::test_calculation_is_traceable_and_reports_missing_data` |
| hydro balance | `test_hydro_balance.py`, `test_api_flows.py::test_hydroponics_balance_ranges_alerts_and_auto_resolve` |
| weather online (mocked HTTP), offline fallback, stale, invalid response | `test_weather.py` (6) |
| logic: parser, CNF, TT-entails, DPLL | `test_logic.py` (10) |
| FC/BC (including missing data) | `test_inference.py::test_forward_chaining_agenda_and_known_false_literals`, `::test_backward_chaining_proven_unknown_disproven`, `::test_forward_and_backward_agree_on_reference_scenarios` |
| conflict resolution | `test_inference.py::test_conflict_resolution_priority_then_specificity_then_code`, `::test_decide_blocks_consequences_of_overridden_actions` |
| KB validation conflict detection | `test_kb_validation.py::test_equal_priority_overlap_is_reported_as_conflict`, `::test_integrity_constraint_violation_is_reported_with_a_witness`, `test_ai_endpoints.py::test_logic_lab_and_validation` |
| chatbot intents AR/EN and disambiguation | `test_nlu.py::test_intents_in_arabic_and_english`, `test_ai_endpoints.py::test_chatbot_disambiguation_english_and_no_hallucination`, `::test_chatbot_slot_filling_offline_weather_then_water` |
| A\* = UCS optimality property | `test_search.py::test_astar_matches_ucs_and_expands_no_more_nodes`, `::test_heuristic_is_admissible_on_every_reachable_state` |
| CSP feasible / infeasible | `test_csp.py` (3), `test_ai_endpoints.py::test_schedule_endpoint` |
| analytics on empty DB | `test_api_flows.py::test_empty_workspace_has_no_fake_numbers` |
| alerts dedupe | `test_api_flows.py::test_water_records_alerts_dedupe_and_analytics` |
| *edge:* no weather | `test_api_flows.py::test_irrigation_without_weather_gives_insufficient_data`, chatbot slot-filling test |
| *edge:* stale weather | `test_weather.py::test_service_flags_stale_snapshot` |
| *edge:* missing stage | `test_fao56.py::test_stage_boundaries` (not yet planted / season ended), stage override in the CRUD test |
| *edge:* zero area | `test_api_flows.py::test_farm_and_planting_crud_with_validation` (`area_m2 = 0` → 422) |
| *edge:* unauthorized farm / company | `test_authorization.py::test_other_company_gets_404_everywhere` |
| *edge:* empty DB | `test_api_flows.py::test_empty_workspace_has_no_fake_numbers`, `test_migrations.py` |
| *edge:* no hydro records | `test_api_flows.py::test_hydroponic_system_without_records`; missing balance terms in `test_hydro_balance.py::test_missing_terms_are_reported_not_assumed` |
| *edge:* insufficient water | `test_api_flows.py::test_irrigation_recommendation_full_explanation_contract` (deficit), `test_ai_endpoints.py` chatbot test |
| *edge:* infeasible allocation | `test_search.py::test_infeasible_minimums_are_explained`, `test_ai_endpoints.py::test_land_distribution_endpoint` |

Beyond §18: migrations (`test_migrations.py`) and the course constraint "no ML / generative AI" (`test_no_ml.py`).

Not covered by an automated test:

- the optional `demo_seed` script;
- the Docker images, including the client-IP handling behind nginx ([deployment.md §6.4](deployment.md#64-client-ip-behind-the-proxy)).

## 3. Frontend tests (Vitest)

### 3.1 Running

```bash
cd frontend
npm test              # = vitest run (single run, no watch)
npx vitest            # watch mode while developing
```

The configuration is in `vite.config.ts` → `test`: `globals: true`, `environment: 'jsdom'`, `css: false`,
`restoreMocks: true`, and `setupFiles: ['./src/test/setup.ts']`. The setup file:

- loads `@testing-library/jest-dom/vitest`;
- polyfills `scrollIntoView` and `matchMedia` for jsdom (`matchMedia` reports `prefers-reduced-motion`);
- after each test, runs `cleanup()`, clears `localStorage` and removes `dir`/`lang` from `<html>`.

Fixtures for the explanation contract are in `src/test/fixtures/` (`explanation-recommendation.json`,
`explanation-insufficient.json`). `src/test/utils.tsx` provides `renderWithProviders` and `mockFetch`, which
replaces the global `fetch` with a router keyed by `"METHOD /path"`. The tests do not need a running backend:
they stub `fetch` (`vi.stubGlobal` / `mockFetch`) or render components directly with fixture props.

### 3.2 What is covered

The 8 files contain 17 tests:

| File | Tests (`it(...)`) | Spec §18 item |
|---|---|---|
| `api.test.ts` | turns the error envelope into an `ApiError` with code, message, details and status · sends the bearer token and calls the unauthorized handler on 401 · maps network failures to a `network_error` and returns `undefined` for 204 · builds URLs with the `/api` base and skips empty query values | — (API client) |
| `auth.test.tsx` | submits the login form and shows the error returned by the API · redirects anonymous visitors from a protected route to `/login` | login form; protected route |
| `dashboard.test.tsx` | renders the onboarding empty state (and no numbers) when the workspace is empty · shows an error with a retry action when the summary fails | dashboard empty state |
| `recommendationCard.test.tsx` | renders the recommendation, facts used, fired rules and the alternatives that were ruled out · renders the insufficient-data variant with the Arabic sentence and the missing percepts | recommendation card |
| `chat.test.tsx` | sends the question with the UI language and renders quick-reply chips from options | chatbot rendering |
| `i18n.test.tsx` | switches `<html dir>` to `rtl` for Arabic and back to `ltr` for English · has an Arabic translation for every English key and interpolates variables | RTL toggle |
| `format.test.ts` | formats numbers and units per language and never invents values · renders rule formulas with logic symbols · localises known server messages for Arabic and keeps unknown ones | — (formatting / localisation) |
| `landGrid.test.tsx` | renders exactly N land units, crop units first and the rest fallow | — (land distribution UI) |

All six frontend items in spec §18 are covered: login form, protected route, dashboard empty state,
recommendation card, chatbot rendering and RTL toggle.

## 4. Static checks

| Check | Command | Configuration |
|---|---|---|
| Lint (backend) | `ruff check .` (in `backend/`) | `pyproject.toml`: line length 150 (bilingual message templates), target Python 3.11, rule sets `E F W I B UP N S BLE C4 SIM` with listed ignores; `alembic/versions` excluded; tests exempt from `S`, `B`, `N` |
| Types (backend) | `mypy` (in `backend/`) | `pyproject.toml`: `files = app/ai, app/agronomy, app/optimization, app/integrations` (the AI core), `check_untyped_defs = true`, `ignore_missing_imports = true` |
| Types (frontend) | `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| Lint (frontend) | `npm run lint` | `eslint.config.js` |
| Build | `npm run build` | `tsc -b && vite build` |
| Migrations | `alembic upgrade head` | automated in `test_migrations.py` (SQLite); in Docker on every backend start |

## 5. Manual end-to-end flow (spec §22)

The specification's end-to-end flow:

> register → login → company → farm → planting → water record → calculation → hydroponic system → hydro record →
> weather (fresh, cached or unavailable) → irrigation recommendation → chatbot question → analytics → land
> distribution → authorization check → logout/login.

Most steps are also covered by the API tests above. The screenshots in [`docs/screenshots/`](screenshots/) (62 files,
English and Arabic, desktop and mobile) were taken from the running application with weather offline mode on.

## 6. Results

QA run of **2026-10-03**:

| Check | Result |
|---|---|
| Backend `pytest`, SQLite (default) | **88 passed** (38.5 s) |
| Backend `pytest`, PostgreSQL 16 (`TEST_DATABASE_URL` → `wo_test`) | **88 passed** (45.8 s) |
| `ruff check .` | All checks passed! |
| `mypy` (AI core packages per `pyproject.toml`) | Success: no issues found in 41 source files |
| Frontend `npm run typecheck` | OK |
| Frontend `npm run lint` | 0 problems |
| Frontend `npm test` | **17 tests in 8 files passed** |
| Frontend `npm run build` | OK |
| `docker compose up` | **not run.** No Docker daemon was available, so the images were not built. `docker compose config` validates the file (see [deployment.md §6](deployment.md#6-docker)). |

I reproduced the backend results while updating this page, on the same day: `88 passed, 1 warning` on SQLite
(37.96 s) and on PostgreSQL (45.40 s), with the same ruff and mypy output. The warning is Starlette's deprecation
notice for `httpx` in `starlette.testclient`; it does not affect any test. The frontend results are those of the
project's QA run.
