"""Administration portal APIs."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_db, require_roles
from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.core.security import hash_password
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    Course,
    FaceEnrollment,
    Instructor,
    PracticalLocation,
    Student,
    StudentStatus,
    User,
    UserRole,
)
from app.schemas import (
    CourseCreateRequest,
    CourseUpdateRequest,
    InstructorCreateRequest,
    InstructorUpdateRequest,
    SessionResponse,
    StudentAdminCreateRequest,
    StudentAdminUpdateRequest,
    VenueQrResponse,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles("admin"))],
)


def session_response(session: AttendanceSession) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        course_id=session.course_id,
        course_code=session.course.code if session.course else None,
        course_title=session.course.title if session.course else None,
        instructor_id=session.instructor_id,
        instructor_name=session.instructor.user.full_name if session.instructor else None,
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


def _campus_time(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(settings.campus_tz)


def _daily_timeline(records: list[AttendanceRecord]) -> list[dict]:
    start_minutes = 8 * 60
    slots = list(range(start_minutes, 16 * 60 + 1, 30))
    arrivals = [0] * len(slots)
    departures = [0] * len(slots)

    def add_event(values: list[int], occurred_at: datetime | None) -> None:
        local = _campus_time(occurred_at)
        if local is None:
            return
        event_minutes = local.hour * 60 + local.minute
        index = min(len(slots) - 1, max(0, (event_minutes - start_minutes) // 30))
        values[index] += 1

    for record in records:
        add_event(arrivals, record.check_in_at)
        add_event(departures, record.check_out_at)

    arrival_total = 0
    departure_total = 0
    timeline = []
    for index, minute in enumerate(slots):
        arrival_total += arrivals[index]
        departure_total += departures[index]
        timeline.append({
            "time": f"{minute // 60:02d}:{minute % 60:02d}",
            "arrivals": arrival_total,
            "departures": departure_total,
        })
    return timeline


@router.get("/dashboard", response_model=None)
async def dashboard(db: AsyncSession = Depends(get_db)) -> dict:
    today = datetime.now(settings.campus_tz).date()
    records = (await db.execute(
        select(AttendanceRecord)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .where(AttendanceSession.session_date == today)
        .order_by(AttendanceRecord.check_in_at)
    )).scalars().all()
    return {
        "date": today.isoformat(),
        "timezone": settings.campus_timezone,
        "students": await _count(db, Student),
        "instructors": await _count(db, Instructor),
        "courses": await _count(db, Course),
        "attendanceRecords": await _count(db, AttendanceRecord),
        "arrivalsToday": len(records),
        "departuresToday": sum(record.check_out_at is not None for record in records),
        "timeline": _daily_timeline(list(records)),
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


def _student_response(student: Student) -> dict:
    return {
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


@router.post("/students", response_model=None, status_code=201)
async def create_student(
    payload: StudentAdminCreateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.STUDENT,
        is_active=payload.is_active,
    )
    student = Student(
        user=user,
        registration_number=payload.registration_number,
        course_of_study=payload.course_of_study,
        year_of_study=payload.year_of_study,
        status=StudentStatus.ACTIVE if payload.is_active else StudentStatus.INACTIVE,
    )
    db.add_all([user, student])
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=admin.id,
            action="student_created",
            entity_type="student",
            entity_id=student.id,
            details={"email": user.email, "registration_number": student.registration_number},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(
            ErrorCode.REGISTRATION_NUMBER_EXISTS,
            "The email address or registration number is already registered.",
            409,
        ) from exc
    return _student_response(student)


@router.patch("/students/{student_id}", response_model=None)
async def update_student(
    student_id: uuid.UUID,
    payload: StudentAdminUpdateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    student = await db.get(Student, student_id)
    if student is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Student not found.", 404)
    values = payload.model_dump(exclude_unset=True)
    for field in ("full_name", "email"):
        if field in values:
            setattr(student.user, field, values[field])
    if "password" in values:
        student.user.password_hash = hash_password(values["password"])
    for field in ("registration_number", "course_of_study", "year_of_study"):
        if field in values:
            setattr(student, field, values[field])
    if "is_active" in values:
        student.user.is_active = values["is_active"]
        student.status = StudentStatus.ACTIVE if values["is_active"] else StudentStatus.INACTIVE
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=admin.id,
            action="student_updated",
            entity_type="student",
            entity_id=student.id,
            details={"fields": sorted(values)},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(
            ErrorCode.REGISTRATION_NUMBER_EXISTS,
            "The email address or registration number is already registered.",
            409,
        ) from exc
    return _student_response(student)


@router.delete("/students/{student_id}", status_code=204)
async def delete_student(
    student_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    student = await db.get(Student, student_id)
    if student is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Student not found.", 404)
    user = student.user
    db.add(AuditLog(
        actor_user_id=admin.id,
        action="student_deleted",
        entity_type="student",
        entity_id=student.id,
        details={"email": user.email, "registration_number": student.registration_number},
        ip_address=request.client.host if request.client else None,
    ))
    await db.flush()
    await db.delete(user)
    await db.commit()
    return Response(status_code=204)


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


@router.patch("/instructors/{instructor_id}", response_model=None)
async def update_instructor(
    instructor_id: uuid.UUID,
    payload: InstructorUpdateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    instructor = await db.get(Instructor, instructor_id)
    if instructor is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Instructor not found.", 404)
    values = payload.model_dump(exclude_unset=True)
    for field in ("full_name", "email", "is_active"):
        if field in values:
            setattr(instructor.user, field, values[field])
    if "password" in values:
        instructor.user.password_hash = hash_password(values["password"])
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=admin.id,
            action="instructor_updated",
            entity_type="instructor",
            entity_id=instructor.id,
            details={"fields": sorted(values)},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(ErrorCode.EMAIL_ALREADY_REGISTERED, "An account already uses this email address.", 409) from exc
    return {
        "id": instructor.id, "userId": instructor.user_id,
        "fullName": instructor.user.full_name, "email": instructor.user.email,
        "isActive": instructor.user.is_active, "createdAt": instructor.created_at,
    }


@router.delete("/instructors/{instructor_id}", status_code=204)
async def delete_instructor(
    instructor_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    instructor = await db.get(Instructor, instructor_id)
    if instructor is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Instructor not found.", 404)
    user = instructor.user
    try:
        db.add(AuditLog(
            actor_user_id=admin.id,
            action="instructor_deleted",
            entity_type="instructor",
            entity_id=instructor.id,
            details={"email": user.email},
            ip_address=request.client.host if request.client else None,
        ))
        await db.flush()
        await db.delete(user)
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Instructor is referenced by an attendance session.", 409) from exc
    return Response(status_code=204)


@router.get("/courses", response_model=None)
async def list_courses(db: AsyncSession = Depends(get_db)) -> list[dict]:
    courses = (await db.execute(select(Course).order_by(Course.code))).scalars().all()
    return [{"id": item.id, "code": item.code, "title": item.title, "createdAt": item.created_at} for item in courses]


@router.post("/courses", response_model=None, status_code=201)
async def create_course(
    payload: CourseCreateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    course = Course(code=payload.code, title=payload.title)
    db.add(course)
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=admin.id, action="course_created", entity_type="course",
            entity_id=course.id, details={"code": course.code},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(ErrorCode.VALIDATION_ERROR, "A course already uses this code.", 409) from exc
    return {"id": course.id, "code": course.code, "title": course.title, "createdAt": course.created_at}


@router.patch("/courses/{course_id}", response_model=None)
async def update_course(
    course_id: uuid.UUID,
    payload: CourseUpdateRequest,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    course = await db.get(Course, course_id)
    if course is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Course not found.", 404)
    values = payload.model_dump(exclude_unset=True)
    for field, value in values.items():
        setattr(course, field, value)
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=admin.id, action="course_updated", entity_type="course",
            entity_id=course.id, details={"fields": sorted(values)},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(ErrorCode.VALIDATION_ERROR, "A course already uses this code.", 409) from exc
    return {"id": course.id, "code": course.code, "title": course.title, "createdAt": course.created_at}


@router.delete("/courses/{course_id}", status_code=204)
async def delete_course(
    course_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    course = await db.get(Course, course_id)
    if course is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Course not found.", 404)
    try:
        db.add(AuditLog(
            actor_user_id=admin.id, action="course_deleted", entity_type="course",
            entity_id=course.id, details={"code": course.code},
            ip_address=request.client.host if request.client else None,
        ))
        await db.flush()
        await db.delete(course)
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Course is referenced by an attendance session.", 409) from exc
    return Response(status_code=204)


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


@router.get("/venue-qr", response_model=VenueQrResponse)
async def venue_qr(db: AsyncSession = Depends(get_db)) -> VenueQrResponse:
    if not settings.venue_static_code_hash or len(settings.venue_static_code_hash) != 64:
        raise ApiError(ErrorCode.VENUE_NOT_CONFIGURED, "Venue code not configured. Set VENUE_STATIC_CODE_HASH.", 503)
    return VenueQrResponse(
        qr_data="VENUE_CODE_IN_ROOM",
        code_hint=f"{settings.venue_static_code_hash[:2].upper()}****",
        expires_at=None,
        message="Static 8-char venue code for entire IPT — scan the QR displayed in the RAFIC room. Check-in 08:00-14:00, check-out 14:00-16:00.",
    )


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)) -> list[SessionResponse]:
    sessions = (
        await db.execute(select(AttendanceSession).order_by(AttendanceSession.session_date.desc(), AttendanceSession.check_in_open))
    ).scalars().all()
    return [session_response(item) for item in sessions]


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


@router.get("/reports/attendance", response_model=None)
async def attendance_report(
    report_date: date | None = Query(default=None, alias="date"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    selected_date = report_date or datetime.now(settings.campus_tz).date()
    rows = (await db.execute(
        select(AttendanceRecord, Student, User)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .join(User, User.id == Student.user_id)
        .where(AttendanceSession.session_date == selected_date)
        .order_by(AttendanceRecord.check_in_at, Student.registration_number)
    )).all()
    return {
        "date": selected_date.isoformat(),
        "timezone": settings.campus_timezone,
        "rows": [
            {
                "id": record.id,
                "studentName": user.full_name,
                "registrationNumber": student.registration_number,
                "arrivedAt": record.check_in_at,
                "checkedOutAt": record.check_out_at,
                "status": record.status.value,
            }
            for record, student, user in rows
        ],
    }
