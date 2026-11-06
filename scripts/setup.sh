#!/usr/bin/env bash
# One-time setup for macOS/Linux. Usage: ./scripts/setup.sh [--sqlite]
#   --sqlite  development-only fallback when PostgreSQL is not installed
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
PY=${PYTHON:-python3}
$PY -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ is required"'
[ -d .venv ] || $PY -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
pip install -r requirements-dev.txt
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env && rm -f .env.bak
  echo "Created backend/.env with a generated JWT_SECRET"
fi
if [ "${1:-}" = "--sqlite" ]; then
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=sqlite:///./wo_dev.db|" .env && rm -f .env.bak
  echo "Using the SQLite development fallback (backend/wo_dev.db)"
fi
echo "Applying migrations (schema + reference knowledge)..."
alembic upgrade head
cd "$ROOT/frontend"
npm ci
echo
echo "Setup complete. Start everything with: ./scripts/dev.sh"
echo "Optional: create a super admin:  cd backend && . .venv/bin/activate && python -m app.scripts.create_superadmin --email admin@example.com"
