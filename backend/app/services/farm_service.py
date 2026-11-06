from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, or_, select, true
from sqlalchemy.orm import Session

from app.agronomy.fao56 import CropParams, growth_stage
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models import (
    Alert,
    Company,
    Crop,
    Farm,
    FarmCrop,
    FarmMember,
    HydroponicSystem,
    IrrigationMethod,
    User,
)
from app.models.base import AlertStatus, Role
from app.schemas.farm import CropCreate, FarmCreate, FarmUpdate, PlantingCreate, PlantingUpdate
from app.services.access import (
    CAN_CREATE_CROP,
    CAN_CREATE_FARM,
    Perm,
    ensure_role,
    get_farm,
    visible_farms_query,
)
from app.services.audit import audit

# ----------------------------------------------------------------------------- farms

def list_farms(db: Session, user: User, page: int, size: int,
               search: str | None = None) -> tuple[list[dict[str, Any]], int]:
    q = visible_farms_query(user)
    if search:
        q = q.where(Farm.name.ilike(f"%{search}%"))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    farms = db.scalars(q.order_by(Farm.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    ids = [f.id for f in farms]
    counts_p = dict(db.execute(select(FarmCrop.farm_id, func.count()).where(FarmCrop.farm_id.in_(ids))
                               .group_by(FarmCrop.farm_id)).all()) if ids else {}
    counts_h = dict(db.execute(select(HydroponicSystem.farm_id, func.count())
                               .where(HydroponicSystem.farm_id.in_(ids))
                               .group_by(HydroponicSystem.farm_id)).all()) if ids else {}
    counts_a = dict(db.execute(select(Alert.farm_id, func.count())
                               .where(Alert.farm_id.in_(ids), Alert.status == AlertStatus.OPEN)
                               .group_by(Alert.farm_id)).all()) if ids else {}
    out = []
    for f in farms:
        d = {c.name: getattr(f, c.name) for c in Farm.__table__.columns}
        d.update(plantings_count=counts_p.get(f.id, 0), hydro_systems_count=counts_h.get(f.id, 0),
                 open_alerts=counts_a.get(f.id, 0))
        out.append(d)
    return out, total


def create_farm(db: Session, user: User, data: FarmCreate, ip: str | None) -> Farm:
    ensure_role(user, CAN_CREATE_FARM, "create farms")
    payload = data.model_dump(exclude={"company_id"})
    if user.role == Role.INDIVIDUAL:
        company_id, owner = None, user.id
    elif user.role == Role.COMPANY_OWNER:
        company_id, owner = user.company_id, None
    else:  # SUPER_ADMIN
        company_id, owner = data.company_id, (None if data.company_id else user.id)
        if company_id and db.get(Company, company_id) is None:
            raise NotFoundError("Company not found.")
    farm = Farm(**payload, company_id=company_id, owner_user_id=owner, created_by_id=user.id)
    db.add(farm)
    db.flush()
    audit(db, user, "farm.create", "farm", farm.id, {"name": farm.name}, ip)
    db.commit()
    db.refresh(farm)
    return farm


def update_farm(db: Session, user: User, farm_id: uuid.UUID, data: FarmUpdate, ip: str | None) -> Farm:
    farm = get_farm(db, user, farm_id, Perm.FARM_UPDATE)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(farm, key, value)
    audit(db, user, "farm.update", "farm", farm.id, {"fields": sorted(changes)}, ip)
    db.commit()
    db.refresh(farm)
    return farm


def delete_farm(db: Session, user: User, farm_id: uuid.UUID, ip: str | None) -> None:
    farm = get_farm(db, user, farm_id, Perm.FARM_DELETE)
    audit(db, user, "farm.delete", "farm", farm.id, {"name": farm.name}, ip)
    db.delete(farm)
    db.commit()


def list_members(db: Session, user: User, farm_id: uuid.UUID) -> list[dict[str, Any]]:
    get_farm(db, user, farm_id, Perm.FARM_READ)
    rows = db.execute(select(User).join(FarmMember, FarmMember.user_id == User.id)
                      .where(FarmMember.farm_id == farm_id)).scalars().all()
    return [{"user_id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role.value} for u in rows]


def add_member(db: Session, user: User, farm_id: uuid.UUID, member_id: uuid.UUID, ip: str | None) -> None:
    farm = get_farm(db, user, farm_id, Perm.FARM_MEMBERS)
    member = db.get(User, member_id)
    if member is None or member.company_id != farm.company_id or farm.company_id is None:
        raise NotFoundError("User not found in this company.")
    if member.role not in (Role.FARM_MANAGER, Role.EMPLOYEE):
        raise ValidationAppError("Only farm managers and employees can be assigned to farms.")
    exists = db.scalar(select(FarmMember).where(FarmMember.farm_id == farm_id, FarmMember.user_id == member_id))
    if exists:
        raise ConflictError("User is already assigned to this farm.")
    db.add(FarmMember(farm_id=farm_id, user_id=member_id))
    audit(db, user, "farm.member_add", "farm", farm_id, {"user_id": str(member_id)}, ip)
    db.commit()


def remove_member(db: Session, user: User, farm_id: uuid.UUID, member_id: uuid.UUID, ip: str | None) -> None:
    get_farm(db, user, farm_id, Perm.FARM_MEMBERS)
    row = db.scalar(select(FarmMember).where(FarmMember.farm_id == farm_id, FarmMember.user_id == member_id))
    if row is None:
        raise NotFoundError("Assignment not found.")
    db.delete(row)
    audit(db, user, "farm.member_remove", "farm", farm_id, {"user_id": str(member_id)}, ip)
    db.commit()


def company_farms(db: Session, user: User, company_id: uuid.UUID) -> list[Farm]:
    if user.role != Role.SUPER_ADMIN and user.company_id != company_id:
        raise NotFoundError("Company not found.")
    q = visible_farms_query(user).where(Farm.company_id == company_id)
    return list(db.scalars(q.order_by(Farm.name)))


# ----------------------------------------------------------------------------- crops

def crop_visibility(user: User):  # type: ignore[no-untyped-def]
    conds = [Crop.is_reference.is_(True)]
    if user.role == Role.SUPER_ADMIN:
        return true()
    if user.company_id is not None:
        conds.append(Crop.company_id == user.company_id)
    conds.append(Crop.owner_user_id == user.id)
    return or_(*conds)


def list_crops(db: Session, user: User, search: str | None = None) -> list[Crop]:
    q = select(Crop).where(crop_visibility(user))
    if search:
        like = f"%{search}%"
        q = q.where(or_(Crop.name_en.ilike(like), Crop.name_ar.ilike(like), Crop.code.ilike(like)))
    return list(db.scalars(q.order_by(Crop.is_reference.desc(), Crop.name_en)))


def get_crop(db: Session, user: User, crop_id: uuid.UUID) -> Crop:
    crop = db.scalar(select(Crop).where(Crop.id == crop_id, crop_visibility(user)))
    if crop is None:
        raise NotFoundError("Crop not found.")
    return crop


def create_crop(db: Session, user: User, data: CropCreate, ip: str | None) -> Crop:
    ensure_role(user, CAN_CREATE_CROP, "create crops")
    crop = Crop(**data.model_dump(), is_reference=False,
                company_id=user.company_id if user.role in (Role.COMPANY_OWNER, Role.FARM_MANAGER) else None,
                owner_user_id=user.id if user.role in (Role.INDIVIDUAL, Role.SUPER_ADMIN) else None)
    db.add(crop)
    db.flush()
    audit(db, user, "crop.create", "crop", crop.id, {"code": crop.code}, ip)
    db.commit()
    db.refresh(crop)
    return crop


def list_methods(db: Session) -> list[IrrigationMethod]:
    return list(db.scalars(select(IrrigationMethod).order_by(IrrigationMethod.efficiency)))


# ----------------------------------------------------------------------------- plantings

def crop_params(crop: Crop) -> CropParams:
    return CropParams(name=crop.name_en, kc_ini=crop.kc_ini, kc_mid=crop.kc_mid, kc_end=crop.kc_end,
                      l_ini=crop.l_ini, l_dev=crop.l_dev, l_mid=crop.l_mid, l_late=crop.l_late,
                      max_height_m=crop.max_height_m, is_perennial=crop.is_perennial, ky=crop.ky)


def stage_summary(planting: FarmCrop, on: date | None = None) -> dict[str, Any] | None:
    if planting.planting_date is None and planting.stage_override is None:
        return None
    on = on or date.today()
    info = growth_stage(crop_params(planting.crop), planting.planting_date or on, on,
                        planting.stage_override.value if planting.stage_override else None)
    return {"status": info.status, "stage": info.stage, "days_since_planting": info.day,
            "day_in_stage": info.day_in_stage, "stage_length": info.stage_length, "note": info.note}


def planting_out(planting: FarmCrop) -> dict[str, Any]:
    d = {c.name: getattr(planting, c.name) for c in FarmCrop.__table__.columns}
    d["crop"] = planting.crop
    d["irrigation_method"] = planting.irrigation_method
    d["current_stage"] = stage_summary(planting)
    return d


def list_plantings(db: Session, user: User, farm_id: uuid.UUID) -> list[FarmCrop]:
    get_farm(db, user, farm_id, Perm.FARM_READ)
    return list(db.scalars(select(FarmCrop).where(FarmCrop.farm_id == farm_id)
                           .order_by(FarmCrop.created_at.desc())))


def get_planting(db: Session, user: User, planting_id: uuid.UUID, perm: Perm = Perm.FARM_READ) -> FarmCrop:
    planting = db.get(FarmCrop, planting_id)
    if planting is None:
        raise NotFoundError("Planting not found.")
    get_farm(db, user, planting.farm_id, perm)
    return planting


def _check_method(db: Session, method_id: uuid.UUID | None) -> None:
    if method_id is not None and db.get(IrrigationMethod, method_id) is None:
        raise NotFoundError("Irrigation method not found.")


def create_planting(db: Session, user: User, farm_id: uuid.UUID, data: PlantingCreate, ip: str | None) -> FarmCrop:
    farm = get_farm(db, user, farm_id, Perm.FARM_UPDATE)
    get_crop(db, user, data.crop_id)
    _check_method(db, data.irrigation_method_id)
    if farm.total_area_m2 is not None:
        used = db.scalar(select(func.coalesce(func.sum(FarmCrop.area_m2), 0.0))
                         .where(FarmCrop.farm_id == farm_id, FarmCrop.status == "active")) or 0.0
        if used + data.area_m2 > farm.total_area_m2 + 1e-6:
            raise ValidationAppError(
                f"Planting area exceeds the farm's free area ({farm.total_area_m2 - used:,.0f} m² left).")
    planting = FarmCrop(farm_id=farm_id, **data.model_dump())
    db.add(planting)
    db.flush()
    audit(db, user, "planting.create", "farm_crop", planting.id, {"farm_id": str(farm_id)}, ip)
    db.commit()
    db.refresh(planting)
    return planting


def update_planting(db: Session, user: User, planting_id: uuid.UUID, data: PlantingUpdate,
                    ip: str | None) -> FarmCrop:
    planting = get_planting(db, user, planting_id, Perm.FARM_UPDATE)
    changes = data.model_dump(exclude_unset=True)
    clear = changes.pop("clear_stage_override", False)
    if "irrigation_method_id" in changes:
        _check_method(db, changes["irrigation_method_id"])
    for key, value in changes.items():
        setattr(planting, key, value)
    if clear:
        planting.stage_override = None
    audit(db, user, "planting.update", "farm_crop", planting.id, {"fields": sorted(changes)}, ip)
    db.commit()
    db.refresh(planting)
    return planting


def delete_planting(db: Session, user: User, planting_id: uuid.UUID, ip: str | None) -> None:
    planting = get_planting(db, user, planting_id, Perm.FARM_UPDATE)
    if user.role == Role.EMPLOYEE:
        raise ForbiddenError("Employees cannot delete plantings.")
    audit(db, user, "planting.delete", "farm_crop", planting.id, {}, ip)
    db.delete(planting)
    db.commit()
