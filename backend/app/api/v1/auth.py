"""Authentication routes: login, refresh, profile."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.deps import get_current_user, get_db, limiter
from app.core.errors import ApiError, ErrorCode
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.entities import AuditLog, ClassGroup, Student, StudentClassEnrollment, User, UserRole
from app.schemas import LoginRequest, MeResponse, RefreshRequest, StudentRegisterRequest, TokenPairResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenPairResponse, status_code=201)
@limiter.limit(settings.rate_limit_login)
async def register_student(
    payload: StudentRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPairResponse:
    if (await db.execute(select(User.id).where(User.email == payload.email))).scalar_one_or_none():
        raise ApiError(ErrorCode.EMAIL_ALREADY_REGISTERED, "An account already uses this email address.", 409)
    if (await db.execute(
        select(Student.id).where(Student.registration_number == payload.registration_number)
    )).scalar_one_or_none():
        raise ApiError(
            ErrorCode.REGISTRATION_NUMBER_EXISTS,
            "This registration number is already registered.",
            409,
        )

    class_group = (await db.execute(
        select(ClassGroup)
        .where(ClassGroup.default_location_id.is_not(None))
        .order_by(ClassGroup.created_at.asc())
        .limit(1)
    )).scalar_one_or_none()
    if class_group is None:
        raise ApiError(
            ErrorCode.REGISTRATION_UNAVAILABLE,
            "Student registration is unavailable until a default class is configured.",
            503,
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.STUDENT,
        is_active=True,
    )
    db.add(user)
    try:
        await db.flush()
        student = Student(
            user_id=user.id,
            registration_number=payload.registration_number,
            course_of_study="Industrial Practical Training - Cybersecurity",
        )
        db.add(student)
        await db.flush()
        db.add(StudentClassEnrollment(student_id=student.id, class_group_id=class_group.id))
        db.add(AuditLog(
            actor_user_id=user.id,
            action="student_self_registered",
            entity_type="student",
            entity_id=student.id,
            details={"class_group_id": str(class_group.id)},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(
            ErrorCode.EMAIL_ALREADY_REGISTERED,
            "The email address or registration number is already registered.",
            409,
        ) from exc

    return TokenPairResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
        role=user.role.value,
        full_name=user.full_name,
    )


@router.post("/login", response_model=TokenPairResponse)
@limiter.limit(settings.rate_limit_login)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> TokenPairResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Constant-shape failure: same error for unknown email and wrong password
    if user is None or not verify_password(payload.password, user.password_hash):
        raise ApiError(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password.", 401)
    if not user.is_active:
        raise ApiError(ErrorCode.ACCOUNT_DISABLED, "This account is disabled.", 403)

    return TokenPairResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
        role=user.role.value,
        full_name=user.full_name,
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPairResponse:
    claims = decode_token(payload.refresh_token, expected_type="refresh")
    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError) as exc:
        raise ApiError(ErrorCode.TOKEN_INVALID, "Invalid refresh token.", 401) from exc
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(ErrorCode.ACCOUNT_DISABLED, "This account is disabled.", 403)
    return TokenPairResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
        role=user.role.value,
        full_name=user.full_name,
    )


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(id=user.id, email=user.email, full_name=user.full_name, role=user.role.value)
