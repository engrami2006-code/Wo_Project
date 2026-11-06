from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow, uuid_pk


class WeatherSnapshot(Base):
    """A validated weather response saved for offline fallback and traceability."""

    __tablename__ = "weather_snapshots"
    __table_args__ = (Index("ix_weather_snapshots_farm_time", "farm_id", "fetched_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str | None] = mapped_column(String(64))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)
    current: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    daily: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    units: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    variables_set: Mapped[str] = mapped_column(String(16), nullable=False, default="core")
