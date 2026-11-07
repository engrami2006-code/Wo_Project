# WO — Water Optimization
<p align="center">
  <img src="docs/screenshots/dashboard-en.png" width="100%" alt="WO Dashboard">
</p>
**Smart water management for agriculture.** WO is a Knowledge-Based Intelligent Decision Support System. It helps farmers, farm managers and agricultural companies decide how much to irrigate, monitor hydroponic systems, record and analyse water use, and plan land allocation under a water budget. Every recommendation explains itself.

> Course project for an Introduction to Artificial Intelligence course (Russell & Norvig, *AIMA*).
> It uses **no machine learning and no generative AI**. The intelligence is a knowledge-based agent built on propositional logic, inference, search and constraint satisfaction.

| | |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, TanStack Query; Arabic and English with full right-to-left support |
| AI | Knowledge-based agent (TELL/ASK), Horn rules, forward and backward chaining, conflict resolution, model checking (TT-ENTAILS, DPLL, resolution), explanation engine |
| Search and CSP | Land distribution with BFS, UCS, Greedy and A* (admissible heuristic from a relaxed problem); irrigation scheduling with AC-3, MRV, LCV and forward checking |
| Agronomy | FAO-56 crop water requirement, FAO-33 yield response factor (Ky), measured hydroponic water balance |
| Weather | Open-Meteo behind a provider interface, with offline fallback to saved snapshots |

---

## Quick start in VS Code (5 steps)

**Prerequisites:** Python 3.11+, Node.js 20+, and PostgreSQL 16. If you can't install PostgreSQL, use Docker (option B below) or the SQLite fallback.

1. Open the `WO-Water-Optimization` folder in VS Code and install the recommended extensions when prompted.
2. Make sure a PostgreSQL database exists. Defaults are user `wo`, password `wo_dev_password`, database `wo`:
   ```sql
   CREATE USER wo WITH PASSWORD 'wo_dev_password' CREATEDB;
   CREATE DATABASE wo OWNER wo;
   ```
   No PostgreSQL? Use `-Sqlite` / `--sqlite` in the next step. This is a development-only fallback.
3. Run the setup once. It creates the venv, installs packages, writes `backend/.env` with a random `JWT_SECRET`, runs the migrations and installs the frontend packages:
   - **Windows (PowerShell):** `powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1` (add `-Sqlite` for the fallback)
   - **macOS / Linux:** `./scripts/setup.sh` (add `--sqlite` for the fallback)
4. Select the interpreter: `Ctrl+Shift+P` → *Python: Select Interpreter* → `backend/.venv`.
5. Start the app: **Run and Debug → "Full stack (API + web)"**, or `.\scripts\dev.ps1` / `./scripts/dev.sh`.
   - Web app: <http://localhost:5173>
   - API docs: <http://localhost:8000/api/docs>

**Create your first account** on the Register page. Choose *Company* to get the company-owner role with team management.

**Optional extras:**
- **Super admin:** run `python -m app.scripts.create_superadmin --email you@example.com` from `backend/` with the venv active. It can edit the knowledge base.
- **Demo data for a presentation:** run `python -m app.scripts.demo_seed` from `backend/`. Everything it creates lives under one farm flagged **DEMO** and uses illustrative values. Sign in as `demo@wo-demo.com` / `DemoPass12345`. Remove it with `--remove`.

### Option B — Docker (no local Python, Node or PostgreSQL needed)
```bash
cp .env.example .env          # set JWT_SECRET (≥ 32 chars) and POSTGRES_PASSWORD
docker compose up --build
```
- App: <http://localhost:8080>
- API docs: <http://localhost:8080/api/docs>

Migrations run automatically when the backend container starts.

---

## Features

- **Farms and plantings.** Company and farm isolation, five roles, and FAO-56 reference crops (32 crops with sourced Kc, stage lengths, height and Ky). You can also add custom crops, which must cite a source.
- **Water management.** Records, daily/weekly/monthly/yearly analytics, L/m², trends and deterministic anomaly detection. Statistics only appear once there is enough history.
- **Water calculations.** Each FAO-56 calculation is stored with its inputs, parameters with sources, steps, result, weather snapshot, user and farm.
- **Smart irrigation.** The decision is one of: full, deficit, critical supply, postpone (rain covers demand), or no irrigation. It comes with advisories and the full explanation. A CSP scheduler assigns time slots under pump capacity and blocked hours.
- **Hydroponics.** Supports NFT, DWC, Ebb & Flow, Drip, Wick, Aeroponics, Raft and Substrate. The water balance covers input, consumed, recycled, discharged, losses and unaccounted water. pH and EC ranges are configurable, with the Cornell lettuce profile available. The KB rules produce alerts and advice.
- **Weather.** Open-Meteo ET0 and precipitation, validated before saving. When offline, the latest snapshot is used and flagged as stale. With no snapshot, weather is reported as "unavailable" and nothing is invented. Air humidity is never treated as soil moisture.
- **Chatbot (AR/EN).** Deterministic NLU (normalisation, intent patterns, entities). Backward chaining finds missing data, and the bot asks for exactly that. When the weather is offline it accepts manual inputs, e.g. «التبخر 6.2 المطر 0».
- **Land distribution.** A* finds the optimal allocation for the selected objective. A comparison with BFS, UCS and Greedy shows nodes expanded and frontier size.
- **Knowledge base.** Versioned rules and parameters, edited by the super admin, with DPLL validation before saving. A Logic Lab compares forward chaining, backward chaining, truth-table model checking, DPLL and resolution.
- **Alerts and recommendations.** Deterministic and explainable. Alerts are deduplicated and resolved automatically when their condition clears.
- **Impact.** Calculated requirement, actual use, apparent savings and measured savings are kept separate. Measured savings require a recorded baseline. WO makes no savings claims of its own.

## How the AI works (one paragraph)
Numbers become propositions in the **perception** step. For example, `water_limited` is true when the available litres are below the FAO-56 gross requirement. These percepts are TELLed to the knowledge base, which holds 39 Horn rules, 8 axioms, 16 parameters and a catalog of 27 percepts.

Then the agent ASKs:
- **System events** use **forward chaining** (PL-FC-ENTAILS with an agenda), followed by **conflict resolution** inside mutually exclusive action groups (priority, then specificity, then lowest rule code).
- **User questions** use **backward chaining** (AND-OR proof). Unknown leaves become the **missing data** to ask for.

The **explanation engine** answers: what is recommended, which facts and rules were used (with firing order), why, why not the alternatives, and what could change the decision.

**Model checking** keeps the KB sound. DPLL with Clark's completion checks consistency, dead rules, conflicts, coverage and redundancy each time a rule is edited. The validator proves that the irrigation decision group is mutually exclusive and exhaustive.

Details: [`docs/ai.md`](docs/ai.md) · [`docs/logic.md`](docs/logic.md) · [`docs/knowledge-base.md`](docs/knowledge-base.md) · [`docs/search.md`](docs/search.md) · [`docs/csp.md`](docs/csp.md) · [course traceability matrix](docs/traceability.md).

## Data policy
- **Reference knowledge** (rules, axioms, parameters, FAO-56 tables, efficiencies, hydroponic profiles) is loaded by migration `0002`. Every scientific value has a source.
- **Operational data** (users, farms, records, weather, recommendations, alerts) **starts empty**.
- Demo data is created only by the manual `demo_seed` script and is flagged **DEMO** in the UI.

## Environment variables (`backend/.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/db` (SQLite fallback: `sqlite:///./wo_dev.db`) |
| `JWT_SECRET` | ≥ 32 random characters (generated by setup) |
| `JWT_EXPIRE_MINUTES` | Token lifetime (default 120) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `OPEN_METEO_BASE_URL` | Weather endpoint |
| `WEATHER_OFFLINE_MODE` | `true` = never call the provider (snapshots or manual ET0 only) |
| `LOGIN_RATE_LIMIT_ATTEMPTS` / `_WINDOW_SECONDS` | Brute-force protection |

## Testing
```bash
cd backend && python -m pytest                     # 86 tests (SQLite by default)
TEST_DATABASE_URL=postgresql+psycopg://wo:wo_dev_password@localhost:5432/wo_test python -m pytest   # same suite on PostgreSQL
ruff check . && mypy                               # lint + types (AI core)
cd ../frontend && npm run typecheck && npm run lint && npm test && npm run build
```
Or run everything with `./scripts/test.sh` / `.\scripts\test.ps1`, or the VS Code task **test: everything**. Coverage is listed in [`docs/testing.md`](docs/testing.md).

## Project structure
```
WO-Water-Optimization/
├── backend/            FastAPI app (app/api, core, models, schemas, services, ai, agronomy, optimization, integrations), alembic/, tests/
├── frontend/           React + TS app (src/pages, components, services, hooks, i18n, types, utils, layouts)
├── docs/               architecture, database, api, ai, logic, knowledge-base, search, csp, agronomy, hydroponics, weather,
│                       security, deployment, testing, traceability, limitations; uml/ (11 diagrams: .mmd, .svg, .png); screenshots/
├── presentation/       WO-Presentation.html (16 slides, EN/AR) + PDF + previews
├── prompt/             MASTER_PROMPT_v2.md (rebuilt spec), the original v1 prompt, PROMPT_REVIEW_AR.md
├── scripts/            setup / dev / test for Windows (.ps1) and macOS/Linux (.sh)
├── .vscode/            launch, tasks, settings, recommended extensions
└── docker-compose.yml  postgres + backend + frontend (nginx)
```

## Limitations and future work
See [`docs/limitations.md`](docs/limitations.md). In short:
- FAO-56 tables are reference starting points.
- Daily effective rainfall is a simplification.
- Available water is entered per day, not measured by sensors (no IoT, by design).
- The rate limiter is single-process.
- The chatbot vocabulary is pattern-based.
- Land search is limited to 60 units and 6 crops.

**Sources** for agronomic values: FAO-56 (Allen et al., 1998), FAO-33/FAO-66 (Ky), FAO Irrigation Water Management Training Manuals 3 and 4, and the Cornell CEA Hydroponic Lettuce Handbook. Statistics in the presentation come from FAO AQUASTAT 2025.


