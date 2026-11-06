from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import hash_password
from app.models import Company, User
from app.models.base import Role
from app.schemas.auth import CompanyCreate, CompanyUpdate, UserCreate, UserUpdate
from app.services.access import CAN_MANAGE_USERS, can_see_user, ensure_role
from app.services.audit import audit
from app.services.auth_service import normalize_email


def list_users(db: Session, actor: User, page: int, size: int) -> tuple[list[User], int]:
    ensure_role(actor, CAN_MANAGE_USERS, "list users")
    q = select(User)
    if actor.role == Role.COMPANY_OWNER:
        q = q.where(User.company_id == actor.company_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.order_by(User.created_at).offset((page - 1) * size).limit(size)).all()
    return list(items), total


def create_user(db: Session, actor: User, data: UserCreate, ip: str | None) -> User:
    ensure_role(actor, CAN_MANAGE_USERS, "create users")
    role = Role(data.role)
    if actor.role == Role.COMPANY_OWNER:
        if role not in (Role.FARM_MANAGER, Role.EMPLOYEE):
            raise ForbiddenError("Company owners can create farm managers and employees only.")
        company_id = actor.company_id
    else:  # SUPER_ADMIN
        company_id = data.company_id
        if role in (Role.FARM_MANAGER, Role.EMPLOYEE, Role.COMPANY_OWNER) and company_id is None:
            raise ValidationAppError("company_id is required for company roles.")
        if role in (Role.INDIVIDUAL, Role.SUPER_ADMIN):
            company_id = None
        if company_id is not None and db.get(Company, company_id) is None:
            raise NotFoundError("Company not found.")
    email = normalize_email(data.email)
    if db.scalar(select(func.count()).select_from(User).where(User.email == email)):
        raise ConflictError("An account with this e-mail already exists.")
    user = User(email=email, password_hash=hash_password(data.password), full_name=data.full_name.strip(),
                role=role, company_id=company_id, preferred_language=data.preferred_language)
    db.add(user)
    db.flush()
    audit(db, actor, "user.create", "user", user.id, {"role": role.value}, ip)
    db.commit()
    return user


def get_user(db: Session, actor: User, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None or not can_see_user(actor, user):
        raise NotFoundError("User not found.")
    return user


def update_user(db: Session, actor: User, user_id: uuid.UUID, data: UserUpdate, ip: str | None) -> User:
    ensure_role(actor, CAN_MANAGE_USERS, "update users")
    user = get_user(db, actor, user_id)
    if user.id == actor.id and data.is_active is False:
        raise ForbiddenError("You cannot deactivate your own account.")
    if actor.role == Role.COMPANY_OWNER and user.role not in (Role.FARM_MANAGER, Role.EMPLOYEE):
        raise ForbiddenError("Company owners can modify farm managers and employees only.")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.preferred_language is not None:
        user.preferred_language = data.preferred_language
    if data.role is not None:
        user.role = Role(data.role)
        user.token_version += 1
    if data.is_active is not None:
        user.is_active = data.is_active
        if not data.is_active:
            user.token_version += 1
    audit(db, actor, "user.update", "user", user.id, data.model_dump(exclude_none=True), ip)
    db.commit()
    db.refresh(user)
    return user


def list_companies(db: Session, actor: User) -> list[Company]:
    if actor.role == Role.SUPER_ADMIN:
        return list(db.scalars(select(Company).order_by(Company.name)))
    if actor.company_id is None:
        return []
    company = db.get(Company, actor.company_id)
    return [company] if company else []


def get_company(db: Session, actor: User, company_id: uuid.UUID) -> Company:
    company = db.get(Company, company_id)
    if company is None or (actor.role != Role.SUPER_ADMIN and actor.company_id != company_id):
        raise NotFoundError("Company not found.")
    return company


def create_company(db: Session, actor: User, data: CompanyCreate, ip: str | None) -> Company:
    ensure_role(actor, {Role.SUPER_ADMIN}, "create companies")
    company = Company(name=data.name.strip())
    db.add(company)
    db.flush()
    audit(db, actor, "company.create", "company", company.id, {"name": company.name}, ip)
    db.commit()
    return company


def update_company(db: Session, actor: User, company_id: uuid.UUID, data: CompanyUpdate,
                   ip: str | None) -> Company:
    company = get_company(db, actor, company_id)
    ensure_role(actor, {Role.SUPER_ADMIN, Role.COMPANY_OWNER}, "update companies")
    company.name = data.name.strip()
    audit(db, actor, "company.update", "company", company.id, {"name": company.name}, ip)
    db.commit()
    return company
