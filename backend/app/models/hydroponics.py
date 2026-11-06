from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    Base,
    HydroSystemType,
    SystemStatus,
    TimestampMixin,
    str_enum,
    uuid_pk,
)

if TYPE_CHECKING:
    from app.models.crop import Crop


class HydroponicSystem(TimestampMixin, Base):
    __tablename__ = "hydroponic_systems"
    __table_args__ = (
        CheckConstraint("growing_area_m2 > 0", name="area_positive"),
        CheckConstraint("plant_count >= 0", name="plants_non_negative"),
        CheckConstraint("reservoir_capacity_l > 0", name="reservoir_positive"),
        CheckConstraint("ph_min IS NULL OR ph_max IS NULL OR ph_min < ph_max", name="ph_order"),
        CheckConstraint("ec_min IS NULL OR ec_max IS NULL OR ec_min < ec_max", name="ec_order"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    system_type: Mapped[HydroSystemType] = mapped_column(str_enum(HydroSystemType), nullable=False)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crops.id", ondelete="SET NULL"))
    growing_area_m2: Mapped[float] = mapped_column(Float, nullable=False)
    plant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reservoir_capacity_l: Mapped[float] = mapped_column(Float, nullable=False)
    is_closed_loop: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[SystemStatus] = mapped_column(str_enum(SystemStatus), nullable=False,
                                                 default=SystemStatus.ACTIVE)
    ph_min: Mapped[float | None] = mapped_column(Float)
    ph_max: Mapped[float | None] = mapped_column(Float)
    ec_min: Mapped[float | None] = mapped_column(Float)
    ec_max: Mapped[float | None] = mapped_column(Float)
    threshold_source: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)

    crop: Mapped[Crop | None] = relationship(lazy="joined")
    records: Mapped[list[HydroponicRecord]] = relationship(back_populates="system",
                                                           cascade="all, delete-orphan")


class HydroponicRecord(Base):
    __tablename__ = "hydroponic_records"
    __table_args__ = (
        CheckConstraint("water_input_l >= 0", name="input_non_negative"),
        CheckConstraint("period_days > 0", name="period_positive"),
        CheckConstraint("ph IS NULL OR (ph >= 0 AND ph <= 14)", name="ph_range"),
        CheckConstraint("ec IS NULL OR ec >= 0", name="ec_non_negative"),
        Index("ix_hydroponic_records_system_time", "system_id", "recorded_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    system_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hydroponic_systems.id", ondelete="CASCADE"), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_days: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    water_input_l: Mapped[float] = mapped_column(Float, nullable=False)
    water_consumed_l: Mapped[float | None] = mapped_column(Float)
    water_recycled_l: Mapped[float | None] = mapped_column(Float)
    water_discharged_l: Mapped[float | None] = mapped_column(Float)
    water_losses_l: Mapped[float | None] = mapped_column(Float)
    reservoir_start_l: Mapped[float | None] = mapped_column(Float)
    reservoir_end_l: Mapped[float | None] = mapped_column(Float)
    ph: Mapped[float | None] = mapped_column(Float)
    ec: Mapped[float | None] = mapped_column(Float)
    water_temp_c: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    system: Mapped[HydroponicSystem] = relationship(back_populates="records")
