#!/usr/bin/env python
"""Register the first system administrator.

Usage:
    python scripts/bootstrap_admin.py --email admin@fikaai.io --full-name "Root Admin" \
        [--password 'S3cure!Pass'] [--instructor]

The password is prompted securely when omitted. Never commit real credentials.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import session_factory  # noqa: E402
from app.models.entities import Instructor, User, UserRole  # noqa: E402


async def create_user(email: str, full_name: str, password: str, role: UserRole) -> None:
    async with session_factory() as db:
        existing = await db.execute(select(User).where(User.email == email))
        user = existing.scalar_one_or_none()
        if user is not None:
            if role == UserRole.INSTRUCTOR and user.role == UserRole.INSTRUCTOR:
                profile = (
                    await db.execute(select(Instructor).where(Instructor.user_id == user.id))
                ).scalar_one_or_none()
                if profile is None:
                    db.add(Instructor(user_id=user.id))
                    await db.commit()
                    print(f"Created missing instructor profile for {email}.")
                    return
            print(f"User {email} already exists with role={user.role.value} - nothing to do.")
            return
        user = User(email=email, password_hash=hash_password(password), full_name=full_name, role=role)
        db.add(user)
        await db.flush()
        if role == UserRole.INSTRUCTOR:
            db.add(Instructor(user_id=user.id))
        await db.commit()
        print(f"Created {role.value}: {email}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap an administrator/instructor account")
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--password", help="Omit to be prompted securely")
    parser.add_argument("--instructor", action="store_true", help="Create an instructor instead of admin")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password for the new account: ")
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.")
        return 1

    role = UserRole.INSTRUCTOR if args.instructor else UserRole.ADMIN
    asyncio.run(create_user(args.email.strip().lower(), args.full_name, password, role))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
