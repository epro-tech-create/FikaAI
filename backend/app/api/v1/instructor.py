"""Instructor portal APIs scoped to the authenticated instructor."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin import _daily_timeline, session_response
from app.core.config import settings
from app.core.deps import get_current_instructor, get_db
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    Course,
    Instructor,
    InstructorCourseAssignment,
    PracticalLocation,
    Student,
    User,
)
from app.schemas import SessionResponse

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
    course_count = int((await db.execute(
        select(func.count()).select_from(InstructorCourseAssignment).where(
            InstructorCourseAssignment.instructor_id == instructor.id
        )
    )).scalar_one())
    return {
        "instructorId": instructor.id,
        "fullName": instructor.user.full_name,
        "date": today.isoformat(),
        "timezone": settings.campus_timezone,
        "assignedCourses": course_count,
        "attendanceRecords": await _instructor_count(db, AttendanceRecord, instructor.id),
        "arrivalsToday": len(attendance),
        "departuresToday": sum(record.check_out_at is not None for record in attendance),
        "timeline": _daily_timeline(list(attendance)),
    }


@router.get("/courses", response_model=None)
async def my_courses(
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    courses = (await db.execute(
        select(Course)
        .join(InstructorCourseAssignment, InstructorCourseAssignment.course_id == Course.id)
        .where(InstructorCourseAssignment.instructor_id == instructor.id)
        .order_by(Course.code)
    )).scalars().all()
    return [{"id": item.id, "code": item.code, "title": item.title} for item in courses]


@router.get("/locations", response_model=None)
async def active_locations(
    _: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    locations = (await db.execute(
        select(PracticalLocation)
        .where(PracticalLocation.is_active.is_(True))
        .order_by(PracticalLocation.name)
    )).scalars().all()
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
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    sessions = (await db.execute(
        select(AttendanceSession)
        .where(AttendanceSession.instructor_id == instructor.id)
        .order_by(AttendanceSession.session_date.desc(), AttendanceSession.check_in_open)
    )).scalars().all()
    return [session_response(item) for item in sessions]


@router.get("/attendance", response_model=None)
async def attendance_list(
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
    return [
        {
            "id": record.id,
            "sessionId": session.id,
            "sessionTitle": session.title,
            "courseCode": session.course.code if session.course else None,
            "studentId": student.id,
            "studentName": user.full_name,
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


@router.get("/attendance/reports", response_model=None)
@router.get("/reports/attendance", response_model=None)
async def attendance_report(
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (await db.execute(
        select(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .group_by(AttendanceRecord.status)
    )).all()
    return {
        "totalAttendanceRecords": sum(count for _, count in rows),
        "byStatus": {status.value: count for status, count in rows},
    }
