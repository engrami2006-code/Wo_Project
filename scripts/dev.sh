#!/usr/bin/env bash
# Start the API (http://localhost:8000/api/docs) and the web app (http://localhost:5173).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM
( cd "$ROOT/backend" && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000 ) &
( cd "$ROOT/frontend" && npm run dev ) &
wait
