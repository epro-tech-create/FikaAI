"""FastAPI dependencies: database session, JWT identity resolution, RBAC guards.

The authenticated user is ALWAYS derived from the JWT. No endpoint accepts a
student/user ID from the request body as the authoritative identity.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from app.core.errors import ApiError, ErrorCode
from app.core.security import decode_token
from app.db.session import session_factory
from app.models.entities import Instructor, Student, StudentStatus, User
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

bearer_scheme = HTTPBearer(auto_error=False)


def _get_ip_key(request: Request) -> str:
    # Only trust X-Real-IP when request comes from a trusted proxy (docker/nginx private net).
    # Direct exposure without proxy must not allow attacker to spoof IP via header and bypass rate limits.
    from ipaddress import ip_address

    trusted_proxy_nets = (
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
    )
    client_host = request.client.host if request.client else ""
    try:
        client_ip = ip_address(client_host)
        is_trusted_proxy = any(
            client_ip in __import__("ipaddress").ip_network(n)
            for n in trusted_proxy_nets
        )
    except ValueError:
        is_trusted_proxy = False
    if is_trusted_proxy:
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            try:
                return ip_address(real_ip.strip()).compressed
            except ValueError:
                pass
    return get_remote_address(request)


# Rate limiter keyed by client IP - uses X-Real-IP from trusted nginx proxy
limiter = Limiter(key_func=_get_ip_key)


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
        raise ApiError(
            ErrorCode.TOKEN_INVALID, "Invalid authentication token.", 401
        ) from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(ErrorCode.ACCOUNT_DISABLED, "This account is disabled.", 403)
    # Token version check: invalidates all tokens on password change / logout / admin revoke
    token_ver = payload.get("ver", 0)
    user_ver = getattr(user, "token_version", 0) or 0
    if int(token_ver) != int(user_ver):
        raise ApiError(
            ErrorCode.TOKEN_INVALID, "Session revoked. Please log in again.", 401
        )
    request.state.user_id = str(user.id)
    return user


def require_roles(*roles: str):
    async def guard(user: User = Depends(get_current_user)) -> User:
        if user.role.value not in roles:
            raise ApiError(
                ErrorCode.FORBIDDEN,
                "You do not have permission to perform this action.",
                403,
            )
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
        raise ApiError(
            ErrorCode.ACCOUNT_DISABLED, "This student profile is inactive.", 403
        )
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
