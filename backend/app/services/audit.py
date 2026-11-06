"""Audit trail for important actions. Never stores secrets."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User

logger = logging.getLogger("wo.audit")
_FORBIDDEN_KEYS = {"password", "password_hash", "token", "access_token", "secret"}


def audit(db: Session, user: User | None, action: str, entity_type: str | None = None,
          entity_id: Any = None, details: dict[str, Any] | None = None, ip: str | None = None) -> None:
    clean = {k: v for k, v in (details or {}).items() if k.lower() not in _FORBIDDEN_KEYS}
    db.add(AuditLog(user_id=user.id if user else None, company_id=user.company_id if user else None,
                    action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id is not None else None, details=clean,
                    ip_address=ip))
    logger.info("audit", extra={"action": action, "entity_type": entity_type,
                                "entity_id": str(entity_id) if entity_id else None,
                                "user_id": str(user.id) if user else None})
