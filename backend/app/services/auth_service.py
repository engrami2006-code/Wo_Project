from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError
from app.core.middleware import SlidingWindowRateLimiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Company, User
from app.models.base import Role, utcnow
from app.schemas.auth import ProfileUpdate, RegisterRequest
from app.services.audit import audit

_settings = get_settings()
login_limiter = SlidingWindowRateLimiter(_settings.login_rate_limit_attempts,
                                         _settings.login_rate_limit_window_seconds)
register_limiter = SlidingWindowRateLimiter(20, 3600)

# A constant hash used to keep login timing similar for unknown e-mails.
_DUMMY_HASH = hash_password("dummy-password-for-timing-0")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def register(db: Session, data: RegisterRequest, ip: str | None) -> User:
    register_limiter.hit(f"register:{ip}")
    email = normalize_email(data.email)
    if db.scalar(select(func.count()).select_from(User).where(User.email == email)):
        raise ConflictError("An account with this e-mail already exists.")
    company = None
    if data.account_type == "company":
        company = Company(name=(data.company_name or "").strip())
        db.add(company)
        db.flush()
    user = User(email=email, password_hash=hash_password(data.password), full_name=data.full_name.strip(),
                role=Role.COMPANY_OWNER if company else Role.INDIVIDUAL,
                company_id=company.id if company else None, preferred_language=data.preferred_language)
    db.add(user)
    db.flush()
    audit(db, user, "user.register", "user", user.id, {"role": user.role.value}, ip)
    if company:
        audit(db, user, "company.create", "company", company.id, {"name": company.name}, ip)
    db.commit()
    return user


def login(db: Session, email: str, password: str, ip: str | None) -> tuple[str, int, User]:
    email = normalize_email(email)
    login_limiter.hit(f"login:{ip}:{email}")
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        verify_password(password, _DUMMY_HASH)
        raise UnauthorizedError("Invalid e-mail or password.")
    if not verify_password(password, user.password_hash):
        audit(db, user, "auth.login_failed", "user", user.id, {}, ip)
        db.commit()
        raise UnauthorizedError("Invalid e-mail or password.")
    if not user.is_active:
        raise ForbiddenError("This account is disabled.")
    user.last_login_at = utcnow()
    token, expires = create_access_token(user.id, user.role.value, user.token_version)
    audit(db, user, "auth.login", "user", user.id, {}, ip)
    db.commit()
    login_limiter.reset(f"login:{ip}:{email}")
    return token, expires, user


def logout(db: Session, user: User, ip: str | None) -> None:
    # Incrementing the token version revokes every token issued so far.
    user.token_version += 1
    audit(db, user, "auth.logout", "user", user.id, {}, ip)
    db.commit()


def update_profile(db: Session, user: User, data: ProfileUpdate, ip: str | None) -> User:
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.preferred_language is not None:
        user.preferred_language = data.preferred_language
    if data.new_password is not None:
        if not data.current_password or not verify_password(data.current_password, user.password_hash):
            raise ForbiddenError("Current password is incorrect.")
        user.password_hash = hash_password(data.new_password)
        user.token_version += 1
        audit(db, user, "user.password_change", "user", user.id, {}, ip)
    db.commit()
    db.refresh(user)
    return user
