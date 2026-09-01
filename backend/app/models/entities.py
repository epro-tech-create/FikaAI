"""SQLAlchemy 2.0 entities for the CCD-Attendance student-attendance MVP.

Tables (UUID PKs, FKs, indexes, unique constraints):
    users, students, instructors, courses, instructor_course_assignments,
    practical_locations, attendance_sessions, face_enrollments,
    location_verifications, face_verifications, attendance_records, audit_logs
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


# ---------------------------------------------------------------- enums
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    INSTRUCTOR = "instructor"
    STUDENT = "student"


class StudentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class LocationType(str, enum.Enum):
    CLASSROOM = "classroom"
    OUTDOOR_FIELD = "outdoor_field"


class SessionStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    LATE = "LATE"
    ABSENT = "ABSENT"
    CHECKED_OUT = "CHECKED_OUT"
    INCOMPLETE = "INCOMPLETE"
    MANUALLY_APPROVED = "MANUALLY_APPROVED"
    REJECTED = "REJECTED"


class VerificationMethod(str, enum.Enum):
    FACE_GPS = "face_gps"
    VENUE_GPS = "venue_gps"
    MANUAL = "manual"


class RecordSource(str, enum.Enum):
    ONLINE = "online"
    OFFLINE_SYNC = "offline_sync"


class LivenessChallengeType(str, enum.Enum):
    BLINK_TWICE = "BLINK_TWICE"
    TURN_LEFT = "TURN_LEFT"
    TURN_RIGHT = "TURN_RIGHT"
    SMILE = "SMILE"
    LOOK_STRAIGHT = "LOOK_STRAIGHT"


CHALLENGE_INSTRUCTIONS: dict[LivenessChallengeType, str] = {
    LivenessChallengeType.BLINK_TWICE: "Blink twice",
    LivenessChallengeType.TURN_LEFT: "Turn your head slowly to the left",
    LivenessChallengeType.TURN_RIGHT: "Turn your head slowly to the right",
    LivenessChallengeType.SMILE: "Smile at the camera",
    LivenessChallengeType.LOOK_STRAIGHT: "Look straight at the camera",
}


def _enum(e: type[enum.Enum], name: str) -> SAEnum:
    return SAEnum(e, name=name, values_callable=lambda x: [m.value for m in x], native_enum=True)


# ---------------------------------------------------------------- core
class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)  # Argon2id hash
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(_enum(UserRole, "user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Student(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "students"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    registration_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    membership_id: Mapped[str | None] = mapped_column(String(30))
    registration_device_hash: Mapped[str | None] = mapped_column(String(64))
    registration_ip: Mapped[str | None] = mapped_column(String(45))
    course_of_study: Mapped[str | None] = mapped_column(String(120))
    year_of_study: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[StudentStatus] = mapped_column(
        _enum(StudentStatus, "student_status"), nullable=False, default=StudentStatus.ACTIVE
    )
    consent_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(lazy="joined")

    __table_args__ = (
        Index(
            "uq_students_registration_device_hash",
            "registration_device_hash",
            unique=True,
            postgresql_where=text("registration_device_hash IS NOT NULL"),
        ),
        Index(
            "uq_students_membership_id",
            "membership_id",
            unique=True,
            postgresql_where=text("membership_id IS NOT NULL"),
        ),
    )


class Course(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "courses"

    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)


class Instructor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "instructors"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    user: Mapped[User] = relationship(lazy="joined")


class InstructorCourseAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "instructor_course_assignments"
    __table_args__ = (UniqueConstraint("instructor_id", "course_id", name="uq_instructor_course"),)

    instructor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instructors.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )

    instructor: Mapped[Instructor] = relationship(lazy="joined")
    course: Mapped[Course] = relationship(lazy="joined")


class PracticalLocation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "practical_locations"

    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    latitude: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    radius_meters: Mapped[int] = mapped_column(Integer, nullable=False)
    location_type: Mapped[LocationType] = mapped_column(_enum(LocationType, "location_type"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (CheckConstraint("radius_meters > 0", name="ck_location_radius_positive"),)


# ------------------------------------------------------- attendance domain
class AttendanceSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attendance_sessions"

    course_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="RESTRICT"), nullable=True
    )
    instructor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instructors.id", ondelete="RESTRICT"), nullable=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("practical_locations.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_in_open: Mapped[time] = mapped_column(Time, nullable=False)
    official_start: Mapped[time] = mapped_column(Time, nullable=False)
    check_in_close: Mapped[time] = mapped_column(Time, nullable=False)
    expected_end: Mapped[time] = mapped_column(Time, nullable=False)
    check_out_close: Mapped[time] = mapped_column(Time, nullable=False)
    late_threshold_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    permitted_radius_meters: Mapped[int] = mapped_column(Integer, nullable=False)
    instructions: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[SessionStatus] = mapped_column(_enum(SessionStatus, "session_status"), nullable=False)
    is_automatic: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)

    course: Mapped[Course | None] = relationship(lazy="joined")
    instructor: Mapped[Instructor | None] = relationship(lazy="joined")
    location: Mapped[PracticalLocation] = relationship(lazy="joined")

    __table_args__ = (
        Index("ix_sessions_status_date", "status", "session_date"),
        Index(
            "uq_attendance_sessions_automatic_date",
            "session_date",
            unique=True,
            postgresql_where=text("is_automatic"),
        ),
        CheckConstraint("permitted_radius_meters > 0", name="ck_session_radius_positive"),
    )


class FaceEnrollment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "face_enrollments"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    # AES-GCM/Fernet encrypted embedding bytes - NEVER returned by any API
    embedding_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    embedding_dim: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    mean_consistency: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Only ONE active face enrolment may exist per student
    __table_args__ = (
        Index(
            "uq_face_enrollment_active_per_student",
            "student_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )


class LocationVerification(UUIDPrimaryKeyMixin, Base):
    """One-time proof that a student was inside the geofence.

    `token` is an opaque single-use capability returned to the client and later
    referenced by check-in / check-out. Rows are consumed atomically.
    """

    __tablename__ = "location_verifications"

    token: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, default=uuid.uuid4, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False
    )
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    distance_meters: Mapped[float] = mapped_column(Float, nullable=False)
    allowed_radius_meters: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_meters: Mapped[float] = mapped_column(Float, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_locverif_student_session", "student_id", "session_id"),)


class FaceVerification(UUIDPrimaryKeyMixin, Base):
    """Liveness challenge + one-time face verification token in a single row.

    Lifecycle: challenge issued -> frames analysed -> similarity compared ->
    on success a short-lived one-time `token` is minted for check-in/out.
    """

    __tablename__ = "face_verifications"

    challenge_token: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, default=uuid.uuid4, nullable=False
    )
    token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    face_enrollment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("face_enrollments.id", ondelete="SET NULL")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False
    )
    challenge_type: Mapped[LivenessChallengeType] = mapped_column(
        _enum(LivenessChallengeType, "liveness_challenge_type"), nullable=False
    )
    challenge_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    liveness_passed: Mapped[bool | None] = mapped_column(Boolean)
    # Aggregate metrics only (blink counts / yaw peaks). Never images or embeddings.
    liveness_metrics: Mapped[dict | None] = mapped_column(JSONB)
    similarity_score: Mapped[float | None] = mapped_column(Float)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(64))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # token expiry after success
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_faceverif_student_session", "student_id", "session_id"),)


class VenueVerification(UUIDPrimaryKeyMixin, Base):
    """One-time venue proof (static 8-char code / QR) bound to student+session.

    Static code is hashed in settings (VENUE_STATIC_CODE_HASH); this table
    mints a short-lived single-use token after successful code check,
    consumed atomically by check-in/out like LocationVerification.
    """

    __tablename__ = "venue_verifications"

    token: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, default=uuid.uuid4, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False
    )
    verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # sha256 of normalized code
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_venueverif_student_session", "student_id", "session_id"),)


class AttendanceRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        # Hard DB guarantee against duplicate attendance for the same student+session
        UniqueConstraint("session_id", "student_id", name="uq_attendance_session_student"),
        Index("ix_attendance_student", "student_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    face_enrollment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("face_enrollments.id", ondelete="SET NULL")
    )
    check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    minutes_late: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    time_spent_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[AttendanceStatus] = mapped_column(_enum(AttendanceStatus, "attendance_status"), nullable=False)
    verification_method: Mapped[VerificationMethod] = mapped_column(
        _enum(VerificationMethod, "verification_method"), nullable=False, default=VerificationMethod.FACE_GPS
    )
    source: Mapped[RecordSource] = mapped_column(
        _enum(RecordSource, "record_source"), nullable=False, default=RecordSource.ONLINE
    )
    idempotency_key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # Sanitized metadata only - never images, embeddings, tokens or passwords
    details: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
