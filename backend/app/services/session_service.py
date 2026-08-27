"""Global automatic-session creation and resolution for students."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, time
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.db.session import session_factory
from app.models.entities import AttendanceSession, LocationType, PracticalLocation, SessionStatus

AUTOMATIC_SESSION_LOCK_KEY = 742_006_815


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
    """Return the requested active session or ensure today's automatic one."""
    now_campus = campus_now()
    if session_id is None:
        return await _ensure_daily_session(now_campus)

    stmt = (
        select(AttendanceSession)
        .where(
            AttendanceSession.id == session_id,
            AttendanceSession.status == SessionStatus.ACTIVE,
            AttendanceSession.session_date == now_campus.today,
        )
    )
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none()


async def _ensure_daily_session(clock: CampusClock) -> AttendanceSession:
    # A separate transaction prevents a read helper from committing unrelated
    # changes accumulated on the request's AsyncSession.
    async with session_factory() as write_db:
        async with write_db.begin():
            await write_db.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": AUTOMATIC_SESSION_LOCK_KEY},
            )
            existing = (
                await write_db.execute(
                    select(AttendanceSession).where(
                        AttendanceSession.session_date == clock.today,
                        AttendanceSession.is_automatic.is_(True),
                    )
                )
            ).scalar_one_or_none()
            location = (
                await write_db.execute(
                    select(PracticalLocation).where(
                        PracticalLocation.name == settings.training_location_name
                    )
                )
            ).scalar_one_or_none()
            if location is None:
                location = PracticalLocation(
                    name=settings.training_location_name,
                    address=settings.training_location_address,
                    latitude=settings.training_latitude,
                    longitude=settings.training_longitude,
                    radius_meters=settings.training_radius_meters,
                    location_type=LocationType.CLASSROOM,
                    is_active=True,
                )
                write_db.add(location)
                await write_db.flush()
            else:
                location.address = settings.training_location_address
                location.latitude = settings.training_latitude
                location.longitude = settings.training_longitude
                location.radius_meters = settings.training_radius_meters
                location.location_type = LocationType.CLASSROOM
                location.is_active = True

            if existing is not None:
                existing.course_id = None
                existing.instructor_id = None
                existing.location_id = location.id
                existing.location = location
                existing.title = "Daily RAFIC Attendance"
                existing.check_in_open = time(8, 0)
                existing.official_start = time(9, 0)
                existing.check_in_close = time(11, 0)
                existing.expected_end = time(15, 30)
                existing.check_out_close = time(15, 30)
                existing.late_threshold_minutes = settings.default_late_threshold_minutes
                existing.permitted_radius_meters = settings.training_radius_meters
                existing.status = SessionStatus.ACTIVE
                return existing

            session = AttendanceSession(
                course_id=None,
                instructor_id=None,
                location_id=location.id,
                location=location,
                title="Daily RAFIC Attendance",
                session_date=clock.today,
                check_in_open=time(8, 0),
                official_start=time(9, 0),
                check_in_close=time(11, 0),
                expected_end=time(15, 30),
                check_out_close=time(15, 30),
                late_threshold_minutes=settings.default_late_threshold_minutes,
                permitted_radius_meters=settings.training_radius_meters,
                status=SessionStatus.ACTIVE,
                is_automatic=True,
            )
            write_db.add(session)
            await write_db.flush()
            return session


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
