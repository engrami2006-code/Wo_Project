"""Load reference knowledge: KB rules, axioms, parameters, percept catalog, FAO-56 crops,
irrigation-method efficiencies and hydroponic reference profiles.

This is the *content of the knowledge base*, not operational data. Users, farms and records
are never seeded.

Revision ID: 0002
Revises: 0001
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from sqlalchemy.orm import Session

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from app.ai.knowledge_base.seed import seed_reference_knowledge

    session = Session(bind=op.get_bind())
    seed_reference_knowledge(session)
    session.flush()


def downgrade() -> None:
    for table in ("knowledge_rule_history", "knowledge_rules", "knowledge_facts", "knowledge_percepts",
                  "knowledge_bases", "hydroponic_profiles", "irrigation_methods"):
        op.execute(f"DELETE FROM {table}")
    op.execute("DELETE FROM crops WHERE is_reference = true")
