"""Operational AI outputs and system records: recommendations, alerts, land distribution,
chat sessions and the audit log."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    AlertSeverity,
    AlertStatus,
    Base,
    RecommendationStatus,
    str_enum,
    utcnow,
    uuid_pk,
)


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (Index("ix_recommendations_farm_time", "farm_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               nullable=False)
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farm_crops.id", ondelete="SET NULL"))
    hydroponic_system_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hydroponic_systems.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    title_en: Mapped[str] = mapped_column(String(300), nullable=False)
    title_ar: Mapped[str] = mapped_column(String(300), nullable=False)
    summary_en: Mapped[str] = mapped_column(Text, nullable=False)
    summary_ar: Mapped[str] = mapped_column(Text, nullable=False)
    amount_l: Mapped[float | None] = mapped_column(Float)
    target_date: Mapped[date | None] = mapped_column(Date)
    certainty: Mapped[str] = mapped_column(String(32), nullable=False)
    data_quality: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[RecommendationStatus] = mapped_column(
        str_enum(RecommendationStatus), default=RecommendationStatus.NEW, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_farm_status", "farm_id", "status"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               nullable=False)
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farm_crops.id", ondelete="CASCADE"))
    hydroponic_system_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hydroponic_systems.id", ondelete="CASCADE"))
    rule_code: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(120), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(str_enum(AlertSeverity), nullable=False)
    title_en: Mapped[str] = mapped_column(String(300), nullable=False)
    title_ar: Mapped[str] = mapped_column(String(300), nullable=False)
    message_en: Mapped[str] = mapped_column(Text, nullable=False)
    message_ar: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[AlertStatus] = mapped_column(str_enum(AlertStatus), default=AlertStatus.OPEN,
                                                nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(300), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_reason: Mapped[str | None] = mapped_column(String(300))


class LandDistributionRequest(Base):
    __tablename__ = "land_distribution_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("farms.id", ondelete="SET NULL"),
                                                      index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    objective: Mapped[str] = mapped_column(String(32), nullable=False)
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)


class LandDistributionResult(Base):
    __tablename__ = "land_distribution_results"

    id: Mapped[uuid.UUID] = uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("land_distribution_requests.id", ondelete="CASCADE"), unique=True,
        nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    allocation: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    objective_value: Mapped[float | None] = mapped_column(Float)
    total_water_l: Mapped[float | None] = mapped_column(Float)
    total_production: Mapped[float | None] = mapped_column(Float)
    search_stats: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    comparison: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"),
                                               index=True, nullable=False)
    language: Mapped[str] = mapped_column(String(2), nullable=False, default="ar")
    state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 onupdate=utcnow, nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_time", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"),
                                                      index=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)
