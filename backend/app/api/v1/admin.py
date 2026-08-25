"""Administration portal APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_db, require_roles
from app.core.errors import ApiError, ErrorCode
from app.core.security import hash_password
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    Course,
    FaceEnrollment,
    Instructor,
    InstructorCourseAssignment,
    PracticalLocation,
    SessionStatus,
    Student,
    User,
    UserRole,
)
from app.schemas import InstructorCreateRequest, SessionCreateRequest, SessionResponse

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles("admin"))],
)


def session_response(session: AttendanceSession) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        course_id=session.course_id,
        course_code=session.course.code,
        course_title=session.course.title,
        instructor_id=session.instructor_id,
        instructor_name=session.instructor.user.full_name,
        location_id=session.location_id,
        location_name=session.location.name,
        title=session.title,
        session_date=session.session_date,
        check_in_open=session.check_in_open,
        official_start=session.official_start,
        check_in_close=session.check_in_close,
        expected_end=session.expected_end,
        check_out_close=session.check_out_close,
        late_threshold_minutes=session.late_threshold_minutes,
        permitted_radius_meters=session.permitted_radius_meters,
        instructions=session.instructions,
        status=session.status.value,
        created_at=session.created_at,
    )


async def _count(db: AsyncSession, model, *criteria) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*criteria))).scalar_one())


@router.get("/dashboard", response_model=None)
async def dashboard(db: AsyncSession = Depends(get_db)) -> dict:
    return {
        "students": await _count(db, Student),
        "instructors": await _count(db, Instructor),
        "courses": await _count(db, Course),
        "locations": await _count(db, PracticalLocation),
        "sessions": await _count(db, AttendanceSession),
        "attendanceRecords": await _count(db, AttendanceRecord),
        "activeFaceEnrollments": await _count(db, FaceEnrollment, FaceEnrollment.is_active.is_(True)),
    }


@router.get("/students", response_model=None)
async def list_students(db: AsyncSession = Depends(get_db)) -> list[dict]:
    students = (await db.execute(select(Student).order_by(Student.registration_number))).scalars().all()
    return [
        {
            "id": student.id,
            "userId": student.user_id,
            "fullName": student.user.full_name,
            "email": student.user.email,
            "registrationNumber": student.registration_number,
            "courseOfStudy": student.course_of_study,
            "yearOfStudy": student.year_of_study,
            "status": student.status.value,
            "isActive": student.user.is_active,
            "createdAt": student.created_at,
        }
        for student in students
    ]


@router.get("/instructors", response_model=None)
async def list_instructors(db: AsyncSession = Depends(get_db)) -> list[dict]:
    instructors = (await db.execute(select(Instructor).order_by(Instructor.created_at))).scalars().all()
    return [
        {
            "id": instructor.id,
            "userId": instructor.user_id,
            "fullName": instructor.user.full_name,
            "email": instructor.user.email,
            "isActive": instructor.user.is_active,
            "createdAt": instructor.created_at,
        }
        for instructor in instructors
    ]


@router.post("/instructors", response_model=None, status_code=201)
async def create_instructor(
    payload: InstructorCreateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if (await db.execute(select(User.id).where(User.email == payload.email))).scalar_one_or_none():
        raise ApiError(ErrorCode.EMAIL_ALREADY_REGISTERED, "An account already uses this email address.", 409)

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.INSTRUCTOR,
        is_active=True,
    )
    db.add(user)
    try:
        await db.flush()
        instructor = Instructor(user_id=user.id, user=user)
        db.add(instructor)
        await db.flush()
        db.add(AuditLog(
            actor_user_id=admin.id,
            action="instructor_created",
            entity_type="instructor",
            entity_id=instructor.id,
            details={"email": user.email},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(ErrorCode.EMAIL_ALREADY_REGISTERED, "An account already uses this email address.", 409) from exc

    return {
        "id": instructor.id,
        "userId": user.id,
        "fullName": user.full_name,
        "email": user.email,
        "isActive": user.is_active,
        "createdAt": instructor.created_at,
    }


@router.get("/courses", response_model=None)
async def list_courses(db: AsyncSession = Depends(get_db)) -> list[dict]:
    courses = (await db.execute(select(Course).order_by(Course.code))).scalars().all()
    return [{"id": item.id, "code": item.code, "title": item.title, "createdAt": item.created_at} for item in courses]


@router.get("/locations", response_model=None)
async def list_locations(db: AsyncSession = Depends(get_db)) -> list[dict]:
    locations = (await db.execute(select(PracticalLocation).order_by(PracticalLocation.name))).scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "address": item.address,
            "latitude": float(item.latitude),
            "longitude": float(item.longitude),
            "radiusMeters": item.radius_meters,
            "locationType": item.location_type.value,
            "isActive": item.is_active,
        }
        for item in locations
    ]


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)) -> list[SessionResponse]:
    sessions = (
        await db.execute(select(AttendanceSession).order_by(AttendanceSession.session_date.desc(), AttendanceSession.check_in_open))
    ).scalars().all()
    return [session_response(item) for item in sessions]


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    payload: SessionCreateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    if payload.instructor_id is None:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "instructorId is required for admin session creation.", 422)
    course = await db.get(Course, payload.course_id)
    instructor = await db.get(Instructor, payload.instructor_id)
    location = await db.get(PracticalLocation, payload.location_id)
    if course is None or instructor is None or location is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Course, instructor, or location not found.", 404)
    assignment = (await db.execute(select(InstructorCourseAssignment.id).where(
        InstructorCourseAssignment.instructor_id == instructor.id,
        InstructorCourseAssignment.course_id == course.id,
    ))).scalar_one_or_none()
    if assignment is None:
        raise ApiError(ErrorCode.FORBIDDEN, "The instructor is not assigned to this course.", 403)
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
        actor_user_id=admin.id,
        action="attendance_session_created",
        entity_type="attendance_session",
        entity_id=session.id,
        details={"course_id": str(course.id), "instructor_id": str(instructor.id)},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    await db.refresh(session)
    return session_response(session)


@router.get("/face-enrollments", response_model=None)
async def list_face_enrollments(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(
        select(FaceEnrollment, Student, User)
        .join(Student, Student.id == FaceEnrollment.student_id)
        .join(User, User.id == Student.user_id)
        .order_by(FaceEnrollment.created_at.desc())
    )).all()
    return [
        {
            "id": enrollment.id,
            "studentId": student.id,
            "studentName": user.full_name,
            "registrationNumber": student.registration_number,
            "provider": enrollment.provider,
            "sampleCount": enrollment.sample_count,
            "meanConsistency": enrollment.mean_consistency,
            "isActive": enrollment.is_active,
            "consentGivenAt": enrollment.consent_given_at,
            "revokedAt": enrollment.revoked_at,
            "createdAt": enrollment.created_at,
        }
        for enrollment, student, user in rows
    ]


@router.get("/users", response_model=None)
async def list_users(db: AsyncSession = Depends(get_db)) -> list[dict]:
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return [
        {"id": item.id, "email": item.email, "fullName": item.full_name, "role": item.role.value,
         "isActive": item.is_active, "createdAt": item.created_at}
        for item in users
    ]


@router.get("/audit-logs", response_model=None)
async def list_audit_logs(db: AsyncSession = Depends(get_db)) -> list[dict]:
    logs = (await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500))).scalars().all()
    return [
        {"id": item.id, "actorUserId": item.actor_user_id, "action": item.action,
         "entityType": item.entity_type, "entityId": item.entity_id, "details": item.details,
         "ipAddress": item.ip_address, "createdAt": item.created_at}
        for item in logs
    ]


@router.get("/reports/summary", response_model=None)
async def reports_summary(db: AsyncSession = Depends(get_db)) -> dict:
    status_rows = (await db.execute(
        select(AttendanceRecord.status, func.count(AttendanceRecord.id)).group_by(AttendanceRecord.status)
    )).all()
    return {
        "totalSessions": await _count(db, AttendanceSession),
        "totalAttendanceRecords": sum(count for _, count in status_rows),
        "byStatus": {status.value: count for status, count in status_rows},
    }
