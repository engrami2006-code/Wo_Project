"""Create (or promote) a SUPER_ADMIN account. Run manually; never runs automatically.

Usage:
    python -m app.scripts.create_superadmin --email admin@example.com --name "Admin" [--password ...]
If --password is omitted you are prompted for it (input hidden).
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User
from app.models.base import Role


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Super Admin")
    parser.add_argument("--password")
    args = parser.parse_args()
    password = args.password or getpass.getpass("Password (min 10 chars, letters + digits): ")
    if len(password) < 10 or not any(c.isdigit() for c in password) or not any(c.isalpha() for c in password):
        print("Password must be at least 10 characters with letters and digits.", file=sys.stderr)
        return 1
    email = args.email.strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, full_name=args.name, password_hash=hash_password(password),
                        role=Role.SUPER_ADMIN, company_id=None, preferred_language="ar")
            db.add(user)
            action = "created"
        else:
            user.role = Role.SUPER_ADMIN
            user.company_id = None
            user.password_hash = hash_password(password)
            user.token_version += 1
            action = "promoted"
        db.commit()
    print(f"SUPER_ADMIN {action}: {email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
