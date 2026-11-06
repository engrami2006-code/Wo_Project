from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser
from app.models import AuditLog, Company, Farm, KnowledgeRule, Recommendation, User, WaterRecord
from app.models.base import Role
from app.schemas.common import ERROR_RESPONSES, Page
from app.services.access import ensure_role

router = APIRouter(prefix="/admin", tags=["Administration"], responses=ERROR_RESPONSES)


@router.get("/audit-logs", response_model=Page[dict[str, Any]], summary="Audit trail (admin: all; owner: company)")
def audit_logs(user: CurrentUser, db: DB, action: str | None = None, user_id: uuid.UUID | None = None,
               page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200)) -> Page[dict[str, Any]]:
    ensure_role(user, {Role.SUPER_ADMIN, Role.COMPANY_OWNER}, "read the audit log")
    q = select(AuditLog)
    if user.role == Role.COMPANY_OWNER:
        q = q.where(AuditLog.company_id == user.company_id)
    if action:
        q = q.where(AuditLog.action.like(f"{action}%"))
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(AuditLog.created_at.desc()).offset((page - 1) * size).limit(size)).all()
    emails = dict(db.execute(select(User.id, User.email).where(User.id.in_({r.user_id for r in rows if r.user_id}))).all())
    items = [{"id": r.id, "action": r.action, "entity_type": r.entity_type, "entity_id": r.entity_id,
              "details": r.details, "user_id": r.user_id, "user_email": emails.get(r.user_id),
              "ip_address": r.ip_address, "created_at": r.created_at} for r in rows]
    return Page[dict[str, Any]](items=items, total=total, page=page, size=size)


@router.get("/stats", response_model=dict[str, int], summary="Platform counts (super admin)")
def stats(user: CurrentUser, db: DB) -> dict[str, int]:
    ensure_role(user, {Role.SUPER_ADMIN}, "read platform statistics")

    def count(model) -> int:  # type: ignore[no-untyped-def]
        return int(db.scalar(select(func.count()).select_from(model)) or 0)

    return {"users": count(User), "companies": count(Company), "farms": count(Farm),
            "water_records": count(WaterRecord), "recommendations": count(Recommendation),
            "rules": count(KnowledgeRule)}
