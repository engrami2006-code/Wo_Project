"""Alembic migrations build the schema and load only reference knowledge (no operational data)."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import sqlalchemy as sa

BACKEND = Path(__file__).resolve().parents[1]


def test_upgrade_head_on_fresh_sqlite():
    with tempfile.TemporaryDirectory() as tmp:
        url = f"sqlite:///{tmp}/mig.db"
        env = os.environ | {"DATABASE_URL": url}
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, env=env, check=True,
                       capture_output=True)
        engine = sa.create_engine(url)
        with engine.connect() as c:
            count = lambda t: c.execute(sa.text(f"SELECT COUNT(*) FROM {t}")).scalar()  # noqa: E731
            assert count("knowledge_rules") == 39
            assert count("crops") >= 30
            assert count("irrigation_methods") == 3
            assert count("users") == 0 and count("farms") == 0 and count("water_records") == 0
        engine.dispose()
