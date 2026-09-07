"""Instructor portal APIs scoped to the authenticated instructor."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin import _daily_timeline, session_response
from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.core.deps import get_current_instructor, get_db
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    Instructor,
    PracticalLocation,
    Student,
    User,
)
from app.schemas import SessionResponse, VenueQrResponse
from app.services.audit_service import audit_detached
from app.services.report_service import build_attendance_report, parse_period, render_attendance_pdf, weekly_attendance_series


def _instructor_ip(request: Request) -> str | None:
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None

router = APIRouter(prefix="/instructor", tags=["instructor"])


async def _instructor_count(db: AsyncSession, model, instructor_id) -> int:
    if model is AttendanceSession:
        stmt = select(func.count()).select_from(AttendanceSession).where(
            AttendanceSession.is_automatic.is_(True)
        )
    else:
        stmt = select(func.count()).select_from(AttendanceRecord)
    return int((await db.execute(stmt)).scalar_one())


@router.get("/dashboard", response_model=None)
async def dashboard(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    today = datetime.now(settings.campus_tz).date()
    attendance = (await db.execute(
        select(AttendanceRecord)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .where(AttendanceSession.session_date == today)
        .order_by(AttendanceRecord.check_in_at)
    )).scalars().all()
    await audit_detached(
        action="instructor_dashboard_viewed",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        details={"date": today.isoformat()},
        ip_address=_instructor_ip(request),
    )
    return {
        "instructorId": instructor.id,
        "fullName": instructor.user.full_name,
        "date": today.isoformat(),
        "timezone": settings.campus_timezone,
        "attendanceRecords": await _instructor_count(db, AttendanceRecord, instructor.id),
        "arrivalsToday": len(attendance),
        "departuresToday": sum(record.check_out_at is not None for record in attendance),
        "timeline": _daily_timeline(list(attendance)),
        "weeklySeries": await weekly_attendance_series(db, today),
    }


@router.get("/locations", response_model=None)
async def active_locations(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    locations = (await db.execute(
        select(PracticalLocation)
        .where(PracticalLocation.is_active.is_(True))
        .order_by(PracticalLocation.name)
    )).scalars().all()
    await audit_detached(
        action="instructor_locations_viewed",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        ip_address=_instructor_ip(request),
    )
    return [
        {
            "id": item.id,
            "name": item.name,
            "address": item.address,
            "radiusMeters": item.radius_meters,
        }
        for item in locations
    ]


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    sessions = (await db.execute(
        select(AttendanceSession)
        .where(AttendanceSession.instructor_id == instructor.id)
        .order_by(AttendanceSession.session_date.desc(), AttendanceSession.check_in_open)
    )).scalars().all()
    await audit_detached(
        action="instructor_sessions_viewed",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        ip_address=_instructor_ip(request),
    )
    return [session_response(item) for item in sessions]


@router.get("/attendance", response_model=None)
async def attendance_list(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = (await db.execute(
        select(AttendanceRecord, AttendanceSession, Student, User)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .join(User, User.id == Student.user_id)
        .order_by(AttendanceRecord.check_in_at.desc())
    )).all()
    await audit_detached(
        action="instructor_attendance_viewed",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        details={"records": len(rows)},
        ip_address=_instructor_ip(request),
    )
    return [
        {
            "id": record.id,
            "sessionId": session.id,
            "sessionTitle": session.title,
            "studentId": student.id,
            "studentName": user.full_name,
            "membershipId": student.membership_id,
            "registrationNumber": student.registration_number,
            "checkInAt": record.check_in_at,
            "checkOutAt": record.check_out_at,
            "minutesLate": record.minutes_late,
            "timeSpentMinutes": record.time_spent_minutes,
            "status": record.status.value,
            "verificationMethod": record.verification_method.value,
        }
        for record, session, student, user in rows
    ]


@router.get("/venue-qr", response_model=VenueQrResponse)
async def venue_qr(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> VenueQrResponse:
    if not settings.venue_static_code_hash or len(settings.venue_static_code_hash) != 64:
        from app.core.errors import ApiError, ErrorCode
        raise ApiError(ErrorCode.VENUE_NOT_CONFIGURED, "Venue code not configured. Set VENUE_STATIC_CODE_HASH.", 503)
    code_hint = f"{settings.venue_static_code_hash[:2].upper()}****"
    await audit_detached(
        action="instructor_venue_qr_viewed",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        ip_address=_instructor_ip(request),
    )
    return VenueQrResponse(
        qr_data="VENUE_CODE_IN_ROOM",
        code_hint=code_hint,
        expires_at=None,
        message="Static 8-char venue code for entire IPT — scan the QR displayed in the RAFIC room. Check-in 08:00-15:00, check-out 15:00-17:00.",
    )


@router.get("/attendance/reports", response_model=None)
@router.get("/reports/attendance", response_model=None)
async def attendance_report(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    report_date: date | None = Query(default=None, alias="date"),
    period: str = Query(default="daily"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        selected_period = parse_period(period)
    except ValueError as error:
        raise ApiError(ErrorCode.VALIDATION_ERROR, str(error), 422) from error
    selected_date = report_date or datetime.now(settings.campus_tz).date()
    report = await build_attendance_report(db, selected_period, selected_date)
    await audit_detached(
        action="instructor_report_viewed",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        details={"period": selected_period, "date": selected_date.isoformat()},
        ip_address=_instructor_ip(request),
    )
    return report


@router.get("/reports/attendance.pdf", response_model=None)
async def attendance_report_pdf(
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    report_date: date | None = Query(default=None, alias="date"),
    period: str = Query(default="daily"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        selected_period = parse_period(period)
    except ValueError as error:
        raise ApiError(ErrorCode.VALIDATION_ERROR, str(error), 422) from error
    selected_date = report_date or datetime.now(settings.campus_tz).date()
    report = await build_attendance_report(db, selected_period, selected_date)
    await audit_detached(
        action="instructor_report_pdf_downloaded",
        actor_user_id=instructor.user_id,
        entity_type="instructor",
        entity_id=instructor.id,
        details={"period": selected_period, "date": selected_date.isoformat()},
        ip_address=_instructor_ip(request),
    )
    filename = f"ccd-attendance-{period}-{report['startDate']}.pdf"
    return Response(
        content=render_attendance_pdf(report),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
