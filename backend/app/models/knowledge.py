"""Database-backed Knowledge Base: facts/parameters, rules (versioned), percept catalog."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, FactKind, TimestampMixin, str_enum, utcnow, uuid_pk


class KnowledgeBase(TimestampMixin, Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class KnowledgeFact(TimestampMixin, Base):
    __tablename__ = "knowledge_facts"
    __table_args__ = (UniqueConstraint("kb_id", "key", name="kb_key"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    kb_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
                                             index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(40))
    kind: Mapped[FactKind] = mapped_column(str_enum(FactKind), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    description_en: Mapped[str] = mapped_column(Text, nullable=False)
    description_ar: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String(400))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))


class KnowledgeRule(TimestampMixin, Base):
    __tablename__ = "knowledge_rules"
    __table_args__ = (UniqueConstraint("kb_id", "code", name="kb_code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    kb_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
                                             index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name_en: Mapped[str] = mapped_column(String(200), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    antecedent: Mapped[str] = mapped_column(Text, nullable=False)
    consequent: Mapped[str] = mapped_column(String(120), nullable=False)
    action_group: Mapped[str | None] = mapped_column(String(64))
    priority: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    severity: Mapped[str | None] = mapped_column(String(16))
    recommendation_en: Mapped[str | None] = mapped_column(Text)
    recommendation_ar: Mapped[str | None] = mapped_column(Text)
    explanation_en: Mapped[str] = mapped_column(Text, nullable=False)
    explanation_ar: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String(400))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))


class KnowledgeRuleHistory(Base):
    __tablename__ = "knowledge_rule_history"

    id: Mapped[uuid.UUID] = uuid_pk()
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("knowledge_rules.id", ondelete="SET NULL"), index=True)
    rule_code: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    change_type: Mapped[str] = mapped_column(String(16), nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)


class PerceptDefinition(Base):
    """Catalog of percept symbols: how a numeric context is grounded into propositions."""

    __tablename__ = "knowledge_percepts"
    __table_args__ = (UniqueConstraint("kb_id", "symbol", name="kb_symbol"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    kb_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
                                             index=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    description_en: Mapped[str] = mapped_column(Text, nullable=False)
    description_ar: Mapped[str] = mapped_column(Text, nullable=False)
    depends_on: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    threshold_key: Mapped[str | None] = mapped_column(String(120))
