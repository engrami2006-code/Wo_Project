#!/bin/sh
# Apply migrations (schema + reference knowledge) before starting the API.
set -e
echo "Running database migrations..."
alembic upgrade head
exec "$@"
