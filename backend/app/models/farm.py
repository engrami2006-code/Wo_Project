from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, GrowthStage, PlantingStatus, TimestampMixin, str_enum, uuid_pk

if TYPE_CHECKING:
    from app.models.crop import Crop, IrrigationMethod
    from app.models.user import User


class Farm(TimestampMixin, Base):
    __tablename__ = "farms"
    __table_args__ = (
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="latitude_range"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="longitude_range"),
        CheckConstraint("total_area_m2 IS NULL OR total_area_m2 > 0", name="area_positive"),
        CheckConstraint("daily_water_allowance_l IS NULL OR daily_water_allowance_l >= 0",
                        name="allowance_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location_name: Mapped[str | None] = mapped_column(String(200))
    total_area_m2: Mapped[float | None] = mapped_column(Float)
    water_source: Mapped[str | None] = mapped_column(String(32))
    daily_water_allowance_l: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    members: Mapped[list[FarmMember]] = relationship(back_populates="farm",
                                                     cascade="all, delete-orphan")
    plantings: Mapped[list[FarmCrop]] = relationship(back_populates="farm",
                                                     cascade="all, delete-orphan")


class FarmMember(Base):
    __tablename__ = "farm_members"
    __table_args__ = (UniqueConstraint("farm_id", "user_id", name="farm_user"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"),
                                               index=True, nullable=False)

    farm: Mapped[Farm] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class FarmCrop(TimestampMixin, Base):
    """A planting: one crop grown on a defined area of a farm."""

    __tablename__ = "farm_crops"
    __table_args__ = (
        CheckConstraint("area_m2 > 0", name="area_positive"),
        CheckConstraint(
            "irrigation_efficiency IS NULL OR (irrigation_efficiency > 0 AND irrigation_efficiency <= 1)",
            name="efficiency_range"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"),
                                               index=True, nullable=False)
    crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crops.id", ondelete="RESTRICT"),
                                               nullable=False)
    variety: Mapped[str | None] = mapped_column(String(120))
    area_m2: Mapped[float] = mapped_column(Float, nullable=False)
    planting_date: Mapped[date | None] = mapped_column(Date)
    soil_type: Mapped[str | None] = mapped_column(String(32))
    irrigation_method_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("irrigation_methods.id", ondelete="SET NULL"), nullable=True)
    irrigation_efficiency: Mapped[float | None] = mapped_column(Float)
    stage_override: Mapped[GrowthStage | None] = mapped_column(str_enum(GrowthStage), nullable=True)
    status: Mapped[PlantingStatus] = mapped_column(str_enum(PlantingStatus),
                                                   default=PlantingStatus.ACTIVE, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    farm: Mapped[Farm] = relationship(back_populates="plantings")
    crop: Mapped[Crop] = relationship(lazy="joined")
    irrigation_method: Mapped[IrrigationMethod | None] = relationship(lazy="joined")
