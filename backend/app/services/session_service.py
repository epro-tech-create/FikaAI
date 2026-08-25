"""Active-session resolution for students.

An ACTIVE session is usable only when:
    session.status == ACTIVE
    AND the campus-local date matches session.session_date
    AND the current campus time falls inside the relevant window
    AND the authenticated student is enrolled in the session's class group.
Identity always comes from the JWT - never from request payloads.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, time
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import (
    AttendanceSession,
    ClassGroup,
    PracticalLocation,
    SessionStatus,
    StudentClassEnrollment,
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


async def find_active_assigned_session(
    db: AsyncSession,
    student_id: uuid.UUID,
    session_id: uuid.UUID | None = None,
) -> AttendanceSession | None:
    """Return the student's active assigned session (optionally a specific one)."""
    now_campus = campus_now()
    stmt = (
        select(AttendanceSession)
        .join(StudentClassEnrollment, StudentClassEnrollment.class_group_id == AttendanceSession.class_group_id)
        .where(
            StudentClassEnrollment.student_id == student_id,
            AttendanceSession.status == SessionStatus.ACTIVE,
            AttendanceSession.session_date == now_campus.today,
        )
        .order_by(AttendanceSession.check_in_open.asc())
    )
    if session_id is not None:
        stmt = stmt.where(AttendanceSession.id == session_id)
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none()


async def ensure_daily_presence_session(db: AsyncSession, student_id: uuid.UUID) -> AttendanceSession:
    """Create/find the internal all-day presence record for the student's class.

    Students do not manage or select sessions. This record only preserves the
    existing attendance foreign keys and concurrency guarantees while the UX
    behaves as a simple daily face-presence scan.
    """
    enrollment = (await db.execute(
        select(StudentClassEnrollment)
        .where(StudentClassEnrollment.student_id == student_id)
        .order_by(StudentClassEnrollment.enrolled_at.asc())
        .limit(1)
    )).scalar_one_or_none()
    if enrollment is None:
        raise ApiError(ErrorCode.NOT_ASSIGNED, "No practical class is assigned to this student.", 403)

    class_group = await db.get(ClassGroup, enrollment.class_group_id)
    location_id = class_group.default_location_id if class_group else None
    if location_id is None:
        location_id = (await db.execute(
            select(PracticalLocation.id).where(PracticalLocation.is_active.is_(True)).order_by(PracticalLocation.name)
        )).scalar_one_or_none()
    if location_id is None:
        raise ApiError(ErrorCode.NOT_FOUND, "No training location has been configured.", 500)

    today = campus_now().today
    existing = (await db.execute(
        select(AttendanceSession).where(
            AttendanceSession.class_group_id == enrollment.class_group_id,
            AttendanceSession.session_date == today,
            AttendanceSession.status == SessionStatus.ACTIVE,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return existing

    daily = AttendanceSession(
        class_group_id=enrollment.class_group_id,
        location_id=location_id,
        title="Daily practical presence",
        session_date=today,
        check_in_open=time(0, 0),
        check_in_close=time(23, 59),
        expected_end=time(23, 59),
        late_threshold_minutes=24 * 60,
        status=SessionStatus.ACTIVE,
    )
    db.add(daily)
    await db.commit()
    await db.refresh(daily)
    return daily


async def get_active_assigned_session_or_error(
    db: AsyncSession,
    student_id: uuid.UUID,
    session_id: uuid.UUID | None = None,
) -> AttendanceSession:
    session = await find_active_assigned_session(db, student_id, session_id)
    if session is None:
        if session_id is not None:
            # A specific session was requested but is either inactive or not assigned
            found = await db.get(AttendanceSession, session_id)
            if found is None:
                raise ApiError(ErrorCode.NOT_FOUND, "Session not found.", 404)
            if found.status != SessionStatus.ACTIVE:
                raise ApiError(ErrorCode.SESSION_INACTIVE, "This attendance session is no longer active.", 409)
            raise ApiError(ErrorCode.NOT_ASSIGNED, "You are not assigned to this attendance session.", 403)
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
        if clock.now_time > session.expected_end:
            raise ApiError(
                ErrorCode.SESSION_CLOSED,
                f"The session ended at {session.expected_end.strftime('%H:%M')}.",
                409,
            )
