from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    TimestampMixin,
    WaterRecordType,
    WaterSource,
    str_enum,
    utcnow,
    uuid_pk,
)


class WaterRecord(TimestampMixin, Base):
    __tablename__ = "water_records"
    __table_args__ = (
        CheckConstraint("volume_l >= 0", name="volume_non_negative"),
        Index("ix_water_records_farm_time", "farm_id", "recorded_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               nullable=False)
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farm_crops.id", ondelete="SET NULL"), index=True)
    hydroponic_system_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hydroponic_systems.id", ondelete="SET NULL"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    volume_l: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[WaterSource] = mapped_column(str_enum(WaterSource), nullable=False)
    record_type: Mapped[WaterRecordType] = mapped_column(str_enum(WaterRecordType), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class WaterCalculation(Base):
    """Immutable, fully traceable record of a water-requirement calculation."""

    __tablename__ = "water_calculations"

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               index=True, nullable=False)
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farm_crops.id", ondelete="SET NULL"), index=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(String(120), nullable=False)
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    steps: Mapped[list[Any]] = mapped_column(JSON, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    weather_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("weather_snapshots.id", ondelete="SET NULL"))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)


class WaterBaseline(Base):
    """A measured historical period used as the reference for real (measured) savings."""

    __tablename__ = "water_baselines"
    __table_args__ = (
        CheckConstraint("total_volume_l >= 0", name="volume_non_negative"),
        CheckConstraint("area_m2 > 0", name="area_positive"),
        CheckConstraint("period_end >= period_start", name="period_order"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               index=True, nullable=False)
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farm_crops.id", ondelete="SET NULL"))
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    total_volume_l: Mapped[float] = mapped_column(Float, nullable=False)
    area_m2: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 nullable=False)
