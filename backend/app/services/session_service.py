"""Global active-session resolution for students.

An ACTIVE session is usable only when:
    session.status == ACTIVE
    AND the campus-local date matches session.session_date
    AND the current campus time falls inside the relevant window
Identity always comes from the JWT - never from request payloads.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, time
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import (
    AttendanceSession,
    Course,
    Instructor,
    InstructorCourseAssignment,
    LocationType,
    PracticalLocation,
    SessionStatus,
)


@dataclass(frozen=True)
class CampusClock:
    now_local: datetime

    @property
    def today(self):
        return self.now_local.date()

    @property
    def now_time(self) -> time:
        return self.now_local.time()


def campus_now() -> CampusClock:
    return CampusClock(datetime.now(settings.campus_tz))


async def find_active_session(
    db: AsyncSession,
    session_id: uuid.UUID | None = None,
) -> AttendanceSession | None:
    """Return today's global active session, optionally restricted by ID."""
    now_campus = campus_now()
    stmt = (
        select(AttendanceSession)
        .where(
            AttendanceSession.status == SessionStatus.ACTIVE,
            AttendanceSession.session_date == now_campus.today,
        )
        .order_by(AttendanceSession.check_in_open.asc())
    )
    if session_id is not None:
        stmt = stmt.where(AttendanceSession.id == session_id)
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none()


async def ensure_daily_presence_session(db: AsyncSession) -> AttendanceSession | None:
    """Create or find the single global all-day presence session.

    Students do not manage or select sessions. This record only preserves the
    existing attendance foreign keys and concurrency guarantees while the UX
    behaves as a simple daily face-presence scan.
    """
    # Serialize fallback creation when several students open attendance together.
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 1_173_172_359})
    today = campus_now().today
    existing = (await db.execute(
        select(AttendanceSession).where(
            AttendanceSession.session_date == today,
            AttendanceSession.status == SessionStatus.ACTIVE,
        ).order_by(AttendanceSession.check_in_open, AttendanceSession.created_at).limit(1)
    )).scalar_one_or_none()
    if existing is not None:
        return existing

    instructor = (
        await db.execute(select(Instructor).order_by(Instructor.created_at, Instructor.id).limit(1))
    ).scalar_one_or_none()
    if instructor is None:
        return None

    course = (await db.execute(select(Course).order_by(Course.created_at, Course.code).limit(1))).scalar_one_or_none()
    if course is None:
        course = Course(code="IPT-CYBER", title="Cybersecurity Industrial Practical Training")
        db.add(course)
        await db.flush()

    location = (await db.execute(
        select(PracticalLocation)
        .where(PracticalLocation.is_active.is_(True))
        .order_by(PracticalLocation.name)
        .limit(1)
    )).scalar_one_or_none()
    if location is None:
        location = PracticalLocation(
            name="Cybersecurity Practical Training Area",
            address="Configured training area",
            latitude=settings.training_latitude,
            longitude=settings.training_longitude,
            radius_meters=settings.training_radius_meters,
            location_type=LocationType.CLASSROOM,
            is_active=True,
        )
        db.add(location)
        await db.flush()

    assignment = (await db.execute(
        select(InstructorCourseAssignment).where(
            InstructorCourseAssignment.instructor_id == instructor.id,
            InstructorCourseAssignment.course_id == course.id,
        )
    )).scalar_one_or_none()
    if assignment is None:
        db.add(InstructorCourseAssignment(instructor_id=instructor.id, course_id=course.id))
        await db.flush()

    daily = AttendanceSession(
        course=course,
        instructor=instructor,
        location=location,
        title="Daily practical presence",
        session_date=today,
        check_in_open=time(0, 0),
        official_start=time(0, 0),
        check_in_close=time(23, 59),
        expected_end=time(23, 59),
        check_out_close=time(23, 59),
        late_threshold_minutes=24 * 60,
        permitted_radius_meters=location.radius_meters,
        status=SessionStatus.ACTIVE,
    )
    db.add(daily)
    await db.commit()
    await db.refresh(daily)
    return daily


async def get_active_session_or_error(
    db: AsyncSession,
    session_id: uuid.UUID | None = None,
) -> AttendanceSession:
    session = await find_active_session(db, session_id)
    if session is None:
        if session_id is not None:
            found = await db.get(AttendanceSession, session_id)
            if found is None:
                raise ApiError(ErrorCode.NOT_FOUND, "Session not found.", 404)
            raise ApiError(ErrorCode.SESSION_INACTIVE, "This attendance session is no longer active today.", 409)
        raise ApiError(ErrorCode.NO_ACTIVE_SESSION, "There is currently no active attendance session.", 404)
    return session


def validate_window(
    session: AttendanceSession,
    purpose: Literal["check_in", "check_out"],
    now_campus: CampusClock | None = None,
) -> None:
    clock = now_campus or campus_now()
    if clock.today != session.session_date:
        raise ApiError(ErrorCode.SESSION_INACTIVE, "This attendance session is not scheduled today.", 409)

    if purpose == "check_in":
        if clock.now_time < session.check_in_open:
            raise ApiError(
                ErrorCode.SESSION_NOT_STARTED,
                f"Check-in opens at {session.check_in_open.strftime('%H:%M')}.",
                409,
            )
        if clock.now_time > session.check_in_close:
            raise ApiError(
                ErrorCode.CHECK_IN_CLOSED,
                f"Check-in closed at {session.check_in_close.strftime('%H:%M')}.",
                409,
            )
    else:  # check_out
        if clock.now_time < session.check_in_open:
            raise ApiError(ErrorCode.SESSION_NOT_STARTED, "The session has not opened yet.", 409)
        if clock.now_time > session.check_out_close:
            raise ApiError(
                ErrorCode.SESSION_CLOSED,
                f"Check-out closed at {session.check_out_close.strftime('%H:%M')}.",
                409,
            )
