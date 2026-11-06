"""Declarative base, portable column helpers and shared enums."""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, MetaData, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {dict[str, Any]: JSON, list[Any]: JSON, uuid.UUID: Uuid}


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_utc(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; normalise everything to aware UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def str_enum(enum_cls: type[enum.Enum], length: int = 32) -> Enum:
    return Enum(enum_cls, native_enum=False, length=length, validate_strings=True,
                values_callable=lambda e: [m.value for m in e])


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow,
                                                 server_default=func.now(), onupdate=utcnow,
                                                 nullable=False)


class Role(str, enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    COMPANY_OWNER = "COMPANY_OWNER"
    FARM_MANAGER = "FARM_MANAGER"
    EMPLOYEE = "EMPLOYEE"
    SUPER_ADMIN = "SUPER_ADMIN"


class WaterSource(str, enum.Enum):
    WELL = "well"
    MUNICIPAL = "municipal"
    DESALINATED = "desalinated"
    TREATED_WASTEWATER = "treated_wastewater"
    RAINWATER = "rainwater"
    SURFACE_WATER = "surface_water"
    RECYCLED = "recycled"
    OTHER = "other"


class WaterRecordType(str, enum.Enum):
    IRRIGATION = "irrigation"
    HYDROPONIC = "hydroponic"
    OTHER = "other"


class PlantingStatus(str, enum.Enum):
    ACTIVE = "active"
    HARVESTED = "harvested"


class GrowthStage(str, enum.Enum):
    INITIAL = "initial"
    DEVELOPMENT = "development"
    MID = "mid"
    LATE = "late"


class HydroSystemType(str, enum.Enum):
    NFT = "NFT"
    DWC = "DWC"
    EBB_FLOW = "EBB_FLOW"
    DRIP = "DRIP"
    WICK = "WICK"
    AEROPONICS = "AEROPONICS"
    RAFT = "RAFT"
    SUBSTRATE = "SUBSTRATE"


class SystemStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"


class FactKind(str, enum.Enum):
    SCIENTIFIC = "scientific"
    POLICY = "policy"
    AXIOM = "axiom"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class RecommendationStatus(str, enum.Enum):
    NEW = "new"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


JSONDict = dict[str, Any]
DateTimeTZ = DateTime(timezone=True)
JSONType = JSON
