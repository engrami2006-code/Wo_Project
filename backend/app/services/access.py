"""Authorization policy: role-based permissions + resource-level isolation (company and farm).

Rule of thumb: a resource the user is not allowed to *see* returns 404 (existence is not
leaked). A resource the user can see but not *modify* returns 403.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Select, false, select, true
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import ForbiddenError, NotFoundError
from app.models import Farm, FarmMember, HydroponicSystem, User
from app.models.base import Role


class Perm(str, enum.Enum):
    FARM_READ = "farm.read"
    FARM_UPDATE = "farm.update"
    FARM_DELETE = "farm.delete"
    FARM_MEMBERS = "farm.members"
    RECORD_CREATE = "record.create"
    RECORD_DELETE = "record.delete"
    AI_RUN = "ai.run"


FARM_ROLE_PERMS: dict[Role, set[Perm]] = {
    Role.SUPER_ADMIN: set(Perm),
    Role.INDIVIDUAL: set(Perm) - {Perm.FARM_MEMBERS},
    Role.COMPANY_OWNER: set(Perm),
    Role.FARM_MANAGER: {Perm.FARM_READ, Perm.FARM_UPDATE, Perm.RECORD_CREATE, Perm.RECORD_DELETE,
                        Perm.AI_RUN},
    Role.EMPLOYEE: {Perm.FARM_READ, Perm.RECORD_CREATE, Perm.AI_RUN},
}

CAN_CREATE_FARM = {Role.INDIVIDUAL, Role.COMPANY_OWNER, Role.SUPER_ADMIN}
CAN_MANAGE_USERS = {Role.COMPANY_OWNER, Role.SUPER_ADMIN}
CAN_CREATE_CROP = {Role.INDIVIDUAL, Role.COMPANY_OWNER, Role.FARM_MANAGER, Role.SUPER_ADMIN}


def farm_visibility(user: User) -> ColumnElement[bool]:
    """SQL condition selecting the farms ``user`` may see."""
    if user.role == Role.SUPER_ADMIN:
        return true()
    if user.role == Role.INDIVIDUAL:
        return (Farm.owner_user_id == user.id) & Farm.company_id.is_(None)
    if user.company_id is None:
        return false()
    if user.role == Role.COMPANY_OWNER:
        return Farm.company_id == user.company_id
    member_farms = select(FarmMember.farm_id).where(FarmMember.user_id == user.id)
    return (Farm.company_id == user.company_id) & Farm.id.in_(member_farms)


def visible_farms_query(user: User) -> Select[tuple[Farm]]:
    return select(Farm).where(farm_visibility(user))


def visible_farm_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(Farm.id).where(farm_visibility(user))))


def get_farm(db: Session, user: User, farm_id: uuid.UUID, perm: Perm = Perm.FARM_READ) -> Farm:
    farm = db.scalar(select(Farm).where(Farm.id == farm_id, farm_visibility(user)))
    if farm is None:
        raise NotFoundError("Farm not found.")
    if perm not in FARM_ROLE_PERMS[user.role]:
        raise ForbiddenError(f"Your role ({user.role.value}) cannot perform '{perm.value}'.")
    return farm


def require_perm(user: User, perm: Perm) -> None:
    if perm not in FARM_ROLE_PERMS[user.role]:
        raise ForbiddenError(f"Your role ({user.role.value}) cannot perform '{perm.value}'.")


def get_system(db: Session, user: User, system_id: uuid.UUID,
               perm: Perm = Perm.FARM_READ) -> HydroponicSystem:
    system = db.get(HydroponicSystem, system_id)
    if system is None:
        raise NotFoundError("Hydroponic system not found.")
    get_farm(db, user, system.farm_id, perm)  # raises 404 when the farm is not visible
    return system


def ensure_role(user: User, allowed: set[Role], action: str) -> None:
    if user.role not in allowed:
        raise ForbiddenError(f"Your role ({user.role.value}) cannot {action}.")


def can_see_user(actor: User, target: User) -> bool:
    if actor.role == Role.SUPER_ADMIN or actor.id == target.id:
        return True
    return (actor.role == Role.COMPANY_OWNER and actor.company_id is not None
            and actor.company_id == target.company_id)
