# Deployment and Local Development

This page explains how to run WO: a PostgreSQL database, the FastAPI backend (`backend/`) and the React frontend
(`frontend/`). It is based on the files in the repository:

- **Backend:** `backend/app/core/config.py`, `backend/requirements*.txt`, `backend/pyproject.toml`,
  `backend/.env.example`, `backend/Dockerfile`, `backend/docker-entrypoint.sh`, `backend/alembic/`,
  `backend/app/scripts/`
- **Frontend:** `frontend/package.json`, `frontend/vite.config.ts`, `frontend/Dockerfile`, `frontend/nginx.conf`,
  `frontend/.env.example`
- **Repository root:** `docker-compose.yml`, `.env.example`, `scripts/*.sh|*.ps1`, `.vscode/*.json`

| You have | Fastest path |
|---|---|
| Python 3.11+, Node.js 20+, PostgreSQL 16 | §2.1: `scripts/setup.*`, then `scripts/dev.*` |
| Python and Node, but no PostgreSQL | §2.1 with `--sqlite` / `-Sqlite` (development-only fallback) |
| Only Docker | §6: `docker compose up --build` |
| VS Code | §8: task **setup (first run)**, then the launch configuration **Full stack (API + web)** |

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 or newer | `setup.*` refuses older versions. The backend image uses `python:3.12-slim`; the development environment used 3.13. |
| Node.js + npm | 20 or newer (`setup.ps1` message); the frontend image uses `node:22-alpine` | `npm ci` installs the exact versions from `package-lock.json` |
| PostgreSQL | 16 | the official database. SQLite is a development-only fallback (§2.3). |
| Docker + Compose v2 | optional | only for §6 |
| Internet | optional | only for live weather from Open-Meteo; WO works offline (see [weather.md](weather.md)) |

## 2. Local development

### 2.1 With the setup scripts (recommended)

Create the PostgreSQL role and database once. The names match the default `DATABASE_URL` in `backend/.env.example`
(`postgresql+psycopg://wo:wo_dev_password@localhost:5432/wo`):

```sql
CREATE USER wo WITH PASSWORD 'wo_dev_password' CREATEDB;
CREATE DATABASE wo OWNER wo;
```

| OS | Install PostgreSQL 16 / open `psql` |
|---|---|
| Ubuntu / Debian | `sudo apt install postgresql`, then `sudo -u postgres psql` |
| macOS (Homebrew) | `brew install postgresql@16 && brew services start postgresql@16` |
| Windows | the EDB installer from postgresql.org, then *SQL Shell (psql)* as user `postgres` |

Then, from the repository root:

```bash
# macOS / Linux
./scripts/setup.sh              # add --sqlite to use the SQLite fallback instead of PostgreSQL
./scripts/dev.sh                # API on :8000 and web app on :5173 (Ctrl+C stops both)
```

```powershell
# Windows (PowerShell 5.1+)
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1     # add -Sqlite for the fallback
.\scripts\dev.ps1                                                 # opens two PowerShell windows (API, web app)
```

Open the web app at `http://localhost:5173` and the API docs at `http://localhost:8000/api/docs`.

`setup.sh` / `setup.ps1` do the following, in order:

1. check that Python is 3.11 or newer (`setup.sh` uses `$PYTHON` or `python3`; `setup.ps1` prefers the `py`
   launcher);
2. create `backend/.venv` if it does not exist, upgrade pip and `pip install -r requirements-dev.txt`;
3. if `backend/.env` does not exist, copy `backend/.env.example` to it and fill `JWT_SECRET` with
   `secrets.token_urlsafe(48)`. An existing `.env` is never overwritten;
4. with `--sqlite` / `-Sqlite`: set `DATABASE_URL=sqlite:///./wo_dev.db` in `backend/.env`;
5. run `alembic upgrade head` (schema + reference knowledge, §4);
6. run `npm ci` in `frontend/`;
7. print how to start the app and how to create a super admin.

`dev.sh` starts `uvicorn app.main:app --reload --port 8000` (in `backend/`, with the venv) and `npm run dev` (in
`frontend/`) as background jobs and stops both on exit. `dev.ps1` starts the same two commands in two new PowerShell
windows.

### 2.2 Manual setup (same result)

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate        # Windows: py -3 -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt                  # runtime: requirements.txt; dev adds pytest, respx, ruff, mypy
cp .env.example .env                                 # then set JWT_SECRET (≥ 32 characters):
python -c "import secrets; print(secrets.token_urlsafe(48))"
alembic upgrade head
uvicorn app.main:app --reload --port 8000

cd ../frontend
npm ci
npm run dev                                          # http://localhost:5173, proxies /api to VITE_PROXY_TARGET
```

- `backend/requirements.txt` pins the runtime packages: FastAPI 0.142.2, Starlette 1.7.0, `uvicorn[standard]` 0.54.0,
  SQLAlchemy 2.1.3, Alembic 1.20.0, `psycopg[binary]` 3.3.6, Pydantic 2.13.5, pydantic-settings 2.15.0,
  email-validator 2.3.0, argon2-cffi 25.1.0, PyJWT 2.15.1, httpx 0.28.1. `requirements-dev.txt` adds pytest 9.1.1,
  respx 0.23.1, ruff 0.16.10 and mypy 2.4.0.
- Run the backend commands **from `backend/`**. The settings read `.env` from the current working directory
  (`env_file=".env"`, i.e. `backend/.env`), and `alembic.ini` sets `prepend_sys_path = .` so that `app` can be
  imported.
- If `JWT_SECRET` is missing or shorter than 32 characters, the API refuses to start (`Settings.validate_runtime`,
  called by `create_app`). The message points to the setup scripts and to `backend/.env.example`.
- Health check: `GET http://localhost:8000/api/health` returns
  `{"status": "ok", "database": true, "version": "2.0.0", "weather_offline_mode": false}`, or `"status": "degraded"`
  when the database cannot be reached.

Other frontend scripts (`package.json`):

| Script | Runs |
|---|---|
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | serves `dist/` on port 4173 with the same `/api` proxy |
| `npm run typecheck` | type check only |
| `npm run lint` | ESLint |
| `npm test` | Vitest (see [testing.md](testing.md)) |

### 2.3 SQLite fallback (development only)

`DATABASE_URL=sqlite:///./wo_dev.db` (set by `--sqlite` / `-Sqlite`) creates `backend/wo_dev.db`. The engine enables
`PRAGMA foreign_keys=ON` and the migrations use batch mode (`render_as_batch=True`), so the same schema and
reference knowledge are created. The full backend test suite runs on SQLite by default (see [testing.md](testing.md)).
PostgreSQL remains the official database. Use SQLite only when PostgreSQL cannot be installed, never for shared or
production data. `.gitignore` excludes `*.db`.

### 2.4 First use

The database starts **empty** except for the reference knowledge (see
[database.md §2](database.md#2-reference-data-vs-operational-data)). Open the web app and register as an individual
farmer or a company owner. Then create a farm, plantings and records. A `SUPER_ADMIN` cannot be registered (§5).
Sample data for a presentation can be loaded on request (§7).

## 3. Environment variables

### 3.1 Backend (`backend/app/core/config.py`, template `backend/.env.example`)

Names are case-insensitive. Values come from the process environment or from `.env` in the working directory
(`backend/.env`). Unknown variables are ignored. Docker Compose passes the variables explicitly (§6).

| Variable | Default in code | Used by | Meaning |
|---|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://wo:wo_dev_password@localhost:5432/wo` | `core/database.py`, `alembic/env.py` | SQLAlchemy URL. `postgres://` and `postgresql://` are rewritten to `postgresql+psycopg://`. `sqlite:///…` is the development fallback. |
| `JWT_SECRET` | *(empty)* | `core/security.py` | HS256 signing secret. **Required, at least 32 characters**, or the API does not start. |
| `JWT_ALGORITHM` | `HS256` | `core/security.py` | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | `120` | `core/security.py` | Access-token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080` | `main.py` | Comma-separated allowed origins (no credentials; GET/POST/PATCH/DELETE/OPTIONS) |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1/forecast` | `services/weather_service.py` | Forecast endpoint |
| `WEATHER_TIMEOUT_SECONDS` | `8.0` | `services/weather_service.py` | HTTP timeout of the weather call |
| `WEATHER_OFFLINE_MODE` | `false` | `services/weather_service.py`, `/api/health` | `true` = never call Open-Meteo; only saved snapshots or manual ET0 are used |
| `LOGIN_RATE_LIMIT_ATTEMPTS` | `10` | `services/auth_service.py` | Failed logins allowed per IP + e-mail in the window |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `300` | `services/auth_service.py` | Login rate-limit window |
| `ENABLE_HSTS` | `false` | `core/middleware.py` | Adds `Strict-Transport-Security` (enable only behind HTTPS) |
| `LOG_LEVEL` | `INFO` | `core/logging.py` | Root log level. Logs are JSON lines on stdout, with sensitive keys redacted. |
| `APP_NAME` | `WO — Water Optimization` | `main.py` | OpenAPI title |
| `ENVIRONMENT` | `development` | — | Declared in `Settings` (Compose sets `production`, the tests set `test`); not read anywhere else in the application code |

Thresholds that matter to agronomists are **knowledge-base parameters**, not environment variables. Examples are the
weather cache time (`weather_cache_minutes`, 60) and the stale-weather limit (`stale_weather_hours`, 12).
Administrators edit them in the Knowledge Base page (see [knowledge-base.md](knowledge-base.md)). The registration
limiter (20 registrations per IP per hour) is fixed in `auth_service.py`.

### 3.2 Docker Compose (root `.env.example` → `.env`)

| Variable | Default (`docker-compose.yml`) | Meaning |
|---|---|---|
| `JWT_SECRET` | — (**required**; Compose stops with *"Set JWT_SECRET (min 32 chars) in .env"*) | passed to the backend |
| `POSTGRES_PASSWORD` | — (**required**; *"Set POSTGRES_PASSWORD in .env"*) | database password, also used to build the backend's `DATABASE_URL` |
| `POSTGRES_DB`, `POSTGRES_USER` | `wo`, `wo` | database and role |
| `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` | `5432`, `8000`, `8080` | host ports. PostgreSQL and the backend are published on `127.0.0.1` only. |
| `CORS_ORIGINS` | `http://localhost:8080,http://localhost:5173` | passed to the backend |
| `WEATHER_OFFLINE_MODE`, `LOG_LEVEL`, `JWT_EXPIRE_MINUTES`, `OPEN_METEO_BASE_URL` | `false`, `INFO`, `120`, Open-Meteo URL | passed to the backend |

### 3.3 Frontend (`frontend/.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | API base URL as seen by the browser. Keep `/api` behind the Vite proxy or the bundled nginx. Set at **build time**. |
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Dev and preview server only: where `/api` is forwarded |

## 4. Database migrations

Alembic reads the URL from `DATABASE_URL` (`alembic/env.py` overrides `sqlalchemy.url`) and uses
`render_as_batch=True`, so the same migrations run on PostgreSQL and on SQLite.

| Revision | Content |
|---|---|
| `0001_initial_schema` | creates all 26 tables, indexes and check constraints |
| `0002_reference_knowledge` | loads the reference knowledge: 39 rules, 24 facts (parameters and axioms), 27 percepts, 32 FAO-56 crops, 3 irrigation-method efficiencies, the hydroponic reference profile. No users, companies or farms. |

```bash
cd backend
alembic upgrade head      # fresh database → 0002 (head)
alembic current           # shows the applied revision
alembic downgrade 0001    # removes the reference knowledge rows (fails while plantings use reference crops)
```

Migrations run:

- in `scripts/setup.*`;
- in the VS Code task **db: migrate**;
- in Docker, automatically on every backend container start (`docker-entrypoint.sh`: `alembic upgrade head`, then
  `exec` the server).

`backend/tests/test_migrations.py` runs `alembic upgrade head` on a fresh SQLite file. It checks for 39 rules, at
least 30 crops, 3 irrigation methods and no users, farms or water records. Details:
[database.md §5](database.md#5-migrations).

## 5. Create a super admin

`SUPER_ADMIN` accounts are never created automatically. Run the script from `backend/`, with the venv active and the
same `DATABASE_URL`:

```bash
python -m app.scripts.create_superadmin --email admin@example.com --name "Admin"
# you are prompted for the password (hidden input); or pass --password ...
```

```bash
# Docker: run it inside the backend container
docker compose exec backend python -m app.scripts.create_superadmin --email admin@example.com
```

- The password needs at least 10 characters, with letters and digits. Otherwise the script exits with code 1.
- New user: role `SUPER_ADMIN`, no company, preferred language Arabic. Prints `SUPER_ADMIN created: <email>`.
- Existing e-mail: the user is **promoted**. The script sets the role and the new password, removes the company link
  and increments `token_version`, which revokes the user's existing tokens. Prints `SUPER_ADMIN promoted: <email>`.
- The e-mail is only stripped and lower-cased. An internal address such as `admin@wo.local` works, and the login
  endpoint accepts it (see [security.md §1.1](security.md#11-passwords--argon2id)).

## 6. Docker

> **Not verified in this environment.** The images were **not built** here, because no Docker daemon was
> available. `docker compose config` (no daemon needed) parses the file without errors when `JWT_SECRET` and
> `POSTGRES_PASSWORD` are set. When they are missing, it reports the two required-variable errors.

```bash
cp .env.example .env            # set JWT_SECRET (≥ 32 characters) and POSTGRES_PASSWORD
docker compose up --build
```

The app is then at `http://localhost:8080` and the API docs at `http://localhost:8080/api/docs`.

### 6.1 Services (`docker-compose.yml`, project name `wo`)

| Service | Image / build | Details |
|---|---|---|
| `postgres` | `postgres:16-alpine` | volume `pgdata`; health check `pg_isready`; port `127.0.0.1:${POSTGRES_PORT:-5432}` (local only, useful for running the backend outside Docker) |
| `backend` | `./backend/Dockerfile` | waits for `postgres` to be healthy. Environment from §3.2 with `DATABASE_URL=postgresql+psycopg://…@postgres:5432/…`, `ENVIRONMENT=production` and `FORWARDED_ALLOW_IPS="*"` (§6.4). Port `127.0.0.1:${BACKEND_PORT:-8000}`. |
| `frontend` | `./frontend/Dockerfile` | nginx serving the built SPA and proxying `/api/` to `http://backend:8000`. Port `${FRONTEND_PORT:-8080}:80`. |

### 6.2 Backend image (`backend/Dockerfile`, `backend/docker-entrypoint.sh`)

- base `python:3.12-slim`, `pip install -r requirements.txt` (runtime packages only), runs as the non-root user `wo`;
- `ENTRYPOINT ./docker-entrypoint.sh` runs `alembic upgrade head`, then `exec`s the command;
- `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers`;
- `HEALTHCHECK` requests `http://127.0.0.1:8000/api/health` every 30 s;
- `.dockerignore` excludes `.venv`, caches, `*.db` and `.env`.

### 6.3 Frontend image (`frontend/Dockerfile`, `frontend/nginx.conf`)

The image is built in two stages:

1. `node:22-alpine` runs `npm ci` and `npm run build`. `VITE_API_BASE_URL` is a build argument (default `/api`).
2. `nginx:1.27-alpine` serves `dist/` on port 80, with a health check on `/healthz`.

`nginx.conf`:

- proxies `/api/` to `http://backend:8000`;
- sets security headers and a strict Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, …);
- enables gzip;
- caches `/assets/` for one year (hashed file names);
- never caches the SPA shell (`index.html`, the fallback for client-side routes).

nginx resolves the `backend` host name when it starts, so the frontend container needs the Compose network where
that service exists.

### 6.4 Client IP behind the proxy

The backend reads the client IP from `request.client.host` (`core/deps.py::client_ip`) for the rate limiters and
the audit log. Behind nginx this would be the proxy's address. The setup therefore has two parts:

- the backend image starts uvicorn with `--proxy-headers`;
- `docker-compose.yml` sets `FORWARDED_ALLOW_IPS: "*"` for the backend (comment: *"Trust X-Forwarded-For from the
  nginx frontend so audit logs and rate limits see real client IPs."*).

uvicorn then rewrites the client address from `X-Forwarded-For`, so the rate limiters and the audit log see client
IPs instead of the nginx container's address.

**Header spoofing is prevented.** With `*`, uvicorn trusts every hop and takes the **first** entry of
`X-Forwarded-For`. `frontend/nginx.conf` therefore sets `proxy_set_header X-Forwarded-For $remote_addr;`, which
**overwrites** any header the client sent instead of appending to it. The only entry uvicorn sees is the address nginx
observed, so a client cannot choose its apparent IP and the per-IP limits (login: IP + e-mail, registration: IP) hold.
In a deployment with more proxy layers, trust only the proxy network instead of `*`.

The backend port is published on `127.0.0.1` only, so only processes on the host can bypass nginx.

## 7. Demo data (optional)

`backend/app/scripts/demo_seed.py` is a **manual** script for presentations. No migration or startup step runs it.

```bash
cd backend && . .venv/bin/activate                  # Windows: .\.venv\Scripts\Activate.ps1
python -m app.scripts.demo_seed                     # create (re-running first removes the previous demo data)
python -m app.scripts.demo_seed --remove            # delete the demo account and everything under it
# Docker: docker compose exec backend python -m app.scripts.demo_seed
# VS Code: task "db: load demo data (optional)"
```

It creates:

- the account **`demo@wo-demo.com` / `DemoPass12345`** (`COMPANY_OWNER`) and the company
  "DEMO — WO Sample Agro Co.";
- **one farm flagged `is_demo = true`**, "DEMO — Sample Farm (illustrative data)", with three plantings (tomato,
  onion, date palm);
- two water records per day (tomato and onion) for 14 days (`is_demo = true`), a baseline period and a closed-loop
  NFT system with 9 hydroponic records;
- one run of the real agent per planting, with manual weather inputs (ET0 6.4 mm, rain 0). Each run stores the
  calculation, the alerts and, when the agent reaches a decision, the recommendation.

The UI shows a DEMO badge on the farm. All values are illustrative inputs, not measurements from a real farm. Remove
the demo data before any real use.

## 8. VS Code (`.vscode/`)

Open the repository folder and accept the recommended extensions (`extensions.json`):

- Python, Pylance, Python Debugger
- Ruff, ESLint, Tailwind CSS
- Docker, Markdown Mermaid, Vitest Explorer

Then select the interpreter `backend/.venv` (*Python: Select Interpreter*).

| File | Contents |
|---|---|
| `tasks.json` | **setup (first run)** (runs `setup.sh`, or `setup.ps1` on Windows), **backend: dev**, **frontend: dev**, **dev: full stack**, **db: migrate**, **db: load demo data (optional)**, **test: everything** (the default test task; runs `scripts/test.*`), **docker: up** |
| `launch.json` | **Backend: FastAPI (debug)**: uvicorn with `--reload`, `cwd = backend`, `envFile = backend/.env`. **Backend: pytest (current file)**. **Frontend: Vite + Chrome**: starts the task *frontend: dev* first. Compound: **Full stack (API + web)**. |
| `settings.json` | pytest enabled with `cwd = backend` and args `tests`; Ruff as Python formatter using `backend/pyproject.toml` (ruler 150); ESLint working directory `frontend`; workspace TypeScript; caches hidden |

## 9. Production checklist

| Item | Why |
|---|---|
| Long random `JWT_SECRET` (≥ 32 characters) and a strong `POSTGRES_PASSWORD`, kept out of the repository (`.gitignore` excludes `.env`, `backend/.env`, `frontend/.env`) | They sign all tokens and protect the database; the API does not start without the secret |
| HTTPS in front of nginx; `ENABLE_HSTS=true` | HSTS must only be sent over HTTPS. Compose does not pass `ENABLE_HSTS`; add it to the backend environment. |
| `CORS_ORIGINS` limited to the real origin(s) | The defaults are development origins |
| Client IPs from the proxy | Done: Compose sets `FORWARDED_ALLOW_IPS: "*"` and nginx overwrites `X-Forwarded-For` with `$remote_addr`, so clients cannot choose their IP (§6.4). With extra proxy layers, trust only the proxy network. |
| A single backend process, or a shared rate-limit store | The limiter is in memory and per process (see [limitations.md](limitations.md#4-platform)) |
| `WEATHER_OFFLINE_MODE=true` if the server has no internet | Avoids 8-second timeouts; weather is then "unavailable" unless snapshots exist |
| Regular backups of the `pgdata` volume | All operational data (farms, records, recommendations, audit) is in the database |
| No demo data | Run `demo_seed --remove` if it was ever loaded (§7) |
| `alembic upgrade head` on every deployment | Done automatically by the backend container's entrypoint |
