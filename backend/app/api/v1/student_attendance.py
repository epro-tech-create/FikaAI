"""Student attendance endpoints: active session, location check, check-in/out."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_student, get_db, limiter
from app.core.errors import ApiError, ErrorCode
from app.models.entities import AttendanceRecord, AttendanceStatus, ClassGroup, Course, PracticalLocation, Student, StudentClassEnrollment
from app.schemas import (
    ActiveSessionResponse,
    AttendanceRecordResponse,
    AttendanceSubmitRequest,
    LocationVerificationResponse,
    VerifyLocationRequest,
    StudentSummaryResponse,
)
from app.services.attendance_service import check_in as check_in_service
from app.services.attendance_service import check_out as check_out_service
from app.services.location_service import verify_location
from app.services.session_service import ensure_daily_presence_session, find_active_assigned_session

router = APIRouter(prefix="/student/attendance", tags=["student-attendance"])
profile_router = APIRouter(prefix="/student/profile", tags=["student-profile"])


@profile_router.get("/summary", response_model=StudentSummaryResponse)
async def student_summary(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> StudentSummaryResponse:
    """Return the student's seeded class and permanent training-room mapping."""
    result = await db.execute(
        select(StudentClassEnrollment, ClassGroup, Course, PracticalLocation)
        .join(ClassGroup, StudentClassEnrollment.class_group_id == ClassGroup.id)
        .join(Course, ClassGroup.course_id == Course.id)
        .outerjoin(PracticalLocation, ClassGroup.default_location_id == PracticalLocation.id)
        .where(StudentClassEnrollment.student_id == student.id)
        .order_by(StudentClassEnrollment.enrolled_at.asc())
        .limit(1)
    )
    row = result.first()
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "No class assignment found for this student.", 404)
    _, class_group, course, location = row
    return StudentSummaryResponse(
        full_name=student.user.full_name,
        registration_number=student.registration_number,
        course_title=course.title,
        class_group_name=class_group.name,
        permanent_location_name=location.name if location else None,
        permanent_location_address=location.address if location else None,
        allowed_radius_meters=float(location.radius_meters) if location else None,
    )


def _session_dto(session) -> ActiveSessionResponse:
    return ActiveSessionResponse(
        session_id=session.id,
        title=session.title,
        course_code=session.class_group.course.code,
        course_title=session.class_group.course.title,
        class_group_name=session.class_group.name,
        location_name=session.location.name,
        location_address=session.location.address,
        session_date=session.session_date.isoformat(),
        check_in_open=session.check_in_open.strftime("%H:%M"),
        check_in_close=session.check_in_close.strftime("%H:%M"),
        expected_end=session.expected_end.strftime("%H:%M"),
        late_threshold_minutes=session.late_threshold_minutes,
        status=session.status.value,
        allowed_radius_meters=float(session.location.radius_meters),
        latitude=float(session.location.latitude),
        longitude=float(session.location.longitude),
    )


@router.get("/active-session", response_model=ActiveSessionResponse | None)
async def get_active_session(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    """The student's active assigned session for today, or null."""
    session = await ensure_daily_presence_session(db, student.id)
    return _session_dto(session)


@router.post("/verify-location", response_model=LocationVerificationResponse)
@limiter.limit(settings.rate_limit_attendance)
async def verify_location_endpoint(
    payload: VerifyLocationRequest,
    request: Request,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> LocationVerificationResponse:
    record = await verify_location(
        db,
        student=student,
        actor_user_id=student.user_id,
        session_id=payload.session_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy_meters=payload.accuracy_meters,
        captured_at_raw=payload.captured_at,
        ip_address=request.client.host if request.client else None,
    )
    return LocationVerificationResponse(
        verified=True,
        distance_meters=record.distance_meters,
        allowed_radius_meters=record.allowed_radius_meters,
        accuracy_meters=record.accuracy_meters,
        message=("You are inside the attendance area." if settings.gps_verification_enabled
                 else "GPS verification is temporarily disabled."),
        location_verification_token=str(record.token),
        expires_at=record.expires_at,
    )


async def _submit(
    db: AsyncSession,
    request: Request,
    student: Student,
    payload: AttendanceSubmitRequest,
    kind: str,
) -> AttendanceRecordResponse:
    common = dict(
        student=student,
        actor_user_id=student.user_id,
        session_id=payload.session_id,
        location_verification_token=payload.location_verification_token,
        face_verification_token=payload.face_verification_token,
        idempotency_key=payload.idempotency_key,
        ip_address=request.client.host if request.client else None,
    )
    data = (
        await check_in_service(db, **common)
        if kind == "check_in"
        else await check_out_service(db, **common)
    )
    return AttendanceRecordResponse(**data)


@router.post("/check-in", response_model=AttendanceRecordResponse)
@limiter.limit(settings.rate_limit_attendance)
async def check_in_endpoint(
    payload: AttendanceSubmitRequest,
    request: Request,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await _submit(db, request, student, payload, "check_in")


@router.post("/check-out", response_model=AttendanceRecordResponse)
@limiter.limit(settings.rate_limit_attendance)
async def check_out_endpoint(
    payload: AttendanceSubmitRequest,
    request: Request,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await _submit(db, request, student, payload, "check_out")


@router.get("/current", response_model=None)
async def get_current_attendance(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    """Today's record for the active session (if any)."""
    from app.services.session_service import campus_now

    session = await find_active_assigned_session(db, student.id)
    if session is None:
        return {"hasRecord": False, "record": None}
    result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.student_id == student.id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        return {"hasRecord": False, "record": None}
    dto = AttendanceRecordResponse(
        session_id=record.session_id,
        check_in_at=record.check_in_at,
        check_out_at=record.check_out_at,
        status=record.status.value,
        minutes_late=record.minutes_late,
        time_spent_minutes=record.time_spent_minutes,
    )
    return {"hasRecord": True, "record": dto.model_dump(by_alias=True, mode="json")}
