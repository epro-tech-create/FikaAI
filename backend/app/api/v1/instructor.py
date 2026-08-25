"""Instructor portal APIs scoped to the authenticated instructor."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin import session_response
from app.core.deps import get_current_instructor, get_db
from app.core.errors import ApiError, ErrorCode
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    Course,
    Instructor,
    InstructorCourseAssignment,
    PracticalLocation,
    SessionStatus,
    Student,
    User,
)
from app.schemas import SessionCreateRequest, SessionResponse

router = APIRouter(prefix="/instructor", tags=["instructor"])


async def _instructor_count(db: AsyncSession, model, instructor_id) -> int:
    if model is AttendanceSession:
        stmt = select(func.count()).select_from(AttendanceSession).where(AttendanceSession.instructor_id == instructor_id)
    else:
        stmt = (
            select(func.count())
            .select_from(AttendanceRecord)
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .where(AttendanceSession.instructor_id == instructor_id)
        )
    return int((await db.execute(stmt)).scalar_one())


@router.get("/dashboard", response_model=None)
async def dashboard(
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    course_count = int((await db.execute(
        select(func.count()).select_from(InstructorCourseAssignment).where(
            InstructorCourseAssignment.instructor_id == instructor.id
        )
    )).scalar_one())
    return {
        "instructorId": instructor.id,
        "fullName": instructor.user.full_name,
        "assignedCourses": course_count,
        "sessions": await _instructor_count(db, AttendanceSession, instructor.id),
        "attendanceRecords": await _instructor_count(db, AttendanceRecord, instructor.id),
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


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    payload: SessionCreateRequest,
    request: Request,
    instructor: Instructor = Depends(get_current_instructor),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    if payload.instructor_id is not None and payload.instructor_id != instructor.id:
        raise ApiError(ErrorCode.FORBIDDEN, "Instructors may only create their own sessions.", 403)
    course = await db.get(Course, payload.course_id)
    location = await db.get(PracticalLocation, payload.location_id)
    if course is None or location is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Course or location not found.", 404)
    assignment = (await db.execute(select(InstructorCourseAssignment.id).where(
        InstructorCourseAssignment.instructor_id == instructor.id,
        InstructorCourseAssignment.course_id == course.id,
    ))).scalar_one_or_none()
    if assignment is None:
        raise ApiError(ErrorCode.FORBIDDEN, "You are not assigned to this course.", 403)
    if not location.is_active:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "The selected location is inactive.", 422)

    session = AttendanceSession(
        **payload.model_dump(exclude={"instructor_id", "status"}),
        instructor_id=instructor.id,
        status=SessionStatus(payload.status),
        course=course,
        instructor=instructor,
        location=location,
    )
    db.add(session)
    await db.flush()
    db.add(AuditLog(
        actor_user_id=instructor.user_id,
        action="attendance_session_created",
        entity_type="attendance_session",
        entity_id=session.id,
        details={"course_id": str(course.id)},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    await db.refresh(session)
    return session_response(session)


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
        .where(AttendanceSession.instructor_id == instructor.id)
        .order_by(AttendanceRecord.check_in_at.desc())
    )).all()
    return [
        {
            "id": record.id,
            "sessionId": session.id,
            "sessionTitle": session.title,
            "courseCode": session.course.code,
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
        .where(AttendanceSession.instructor_id == instructor.id)
        .group_by(AttendanceRecord.status)
    )).all()
    return {
        "totalAttendanceRecords": sum(count for _, count in rows),
        "byStatus": {status.value: count for status, count in rows},
    }
