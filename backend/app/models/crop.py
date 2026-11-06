"""Reference agronomic knowledge (FAO-56) and user-defined crops."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Boolean, CheckConstraint, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, uuid_pk


class Crop(TimestampMixin, Base):
    __tablename__ = "crops"
    __table_args__ = (
        CheckConstraint("kc_ini >= 0 AND kc_mid >= 0 AND kc_end >= 0", name="kc_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(120), nullable=False)
    aliases: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    kc_ini: Mapped[float] = mapped_column(Float, nullable=False)
    kc_mid: Mapped[float] = mapped_column(Float, nullable=False)
    kc_end: Mapped[float] = mapped_column(Float, nullable=False)
    l_ini: Mapped[int | None] = mapped_column(Integer)
    l_dev: Mapped[int | None] = mapped_column(Integer)
    l_mid: Mapped[int | None] = mapped_column(Integer)
    l_late: Mapped[int | None] = mapped_column(Integer)
    max_height_m: Mapped[float | None] = mapped_column(Float)
    ky: Mapped[float | None] = mapped_column(Float)
    is_perennial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)
    is_reference: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)

    @property
    def season_length_days(self) -> int | None:
        parts = [self.l_ini, self.l_dev, self.l_mid, self.l_late]
        if any(p is None for p in parts):
            return None
        return int(sum(p for p in parts if p is not None))


class IrrigationMethod(Base):
    __tablename__ = "irrigation_methods"
    __table_args__ = (CheckConstraint("efficiency > 0 AND efficiency <= 1", name="efficiency_range"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(120), nullable=False)
    efficiency: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)


class HydroponicProfile(Base):
    """Reference pH/EC ranges with their source. Users may apply one to a system."""

    __tablename__ = "hydroponic_profiles"

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False)
    crop_code: Mapped[str | None] = mapped_column(String(64))
    ph_min: Mapped[float | None] = mapped_column(Float)
    ph_max: Mapped[float | None] = mapped_column(Float)
    ec_min: Mapped[float | None] = mapped_column(Float)
    ec_max: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)
