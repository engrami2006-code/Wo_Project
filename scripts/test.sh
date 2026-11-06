#!/usr/bin/env bash
# Quality gate: backend lint + types + tests, frontend typecheck + lint + tests + build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend" && . .venv/bin/activate
ruff check . && mypy && python -m pytest
cd "$ROOT/frontend"
npm run typecheck && npm run lint && npm test && npm run build
echo "All checks passed."
