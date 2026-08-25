"""FastAPI dependencies: database session, JWT identity resolution, RBAC guards.

The authenticated user is ALWAYS derived from the JWT. No endpoint accepts a
student/user ID from the request body as the authoritative identity.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, ErrorCode
from app.core.security import decode_token
from app.db.session import session_factory
from app.models.entities import Instructor, Student, StudentStatus, User

bearer_scheme = HTTPBearer(auto_error=False)

# Rate limiter keyed by client IP (behind proxies set FORWARDED_ALLOW_IPS / X-Forwarded-For handling)
limiter = Limiter(key_func=get_remote_address)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(ErrorCode.TOKEN_INVALID, "Missing bearer token.", 401)
    payload = decode_token(credentials.credentials, expected_type="access")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise ApiError(ErrorCode.TOKEN_INVALID, "Invalid authentication token.", 401) from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(ErrorCode.ACCOUNT_DISABLED, "This account is disabled.", 403)
    request.state.user_id = str(user.id)
    return user


def require_roles(*roles: str):
    async def guard(user: User = Depends(get_current_user)) -> User:
        if user.role.value not in roles:
            raise ApiError(ErrorCode.FORBIDDEN, "You do not have permission to perform this action.", 403)
        return user

    return guard


async def get_current_student(
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
) -> Student:
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Student profile not found.", 404)
    if student.status != StudentStatus.ACTIVE:
        raise ApiError(ErrorCode.ACCOUNT_DISABLED, "This student profile is inactive.", 403)
    return student


async def get_current_instructor(
    user: User = Depends(require_roles("instructor")),
    db: AsyncSession = Depends(get_db),
) -> Instructor:
    result = await db.execute(select(Instructor).where(Instructor.user_id == user.id))
    instructor = result.scalar_one_or_none()
    if instructor is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Instructor profile not found.", 404)
    return instructor
