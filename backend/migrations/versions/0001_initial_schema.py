"""Initial schema: users, students, courses, class_groups,
student_class_enrollments, practical_locations, attendance_sessions,
face_enrollments, location_verifications, face_verifications,
attendance_records, audit_logs.

Revision ID: 0001
Revises:
Create Date: 2026-08-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

USER_ROLE = sa.Enum("admin", "supervisor", "student", name="user_role")
LOCATION_TYPE = sa.Enum("classroom", "outdoor_field", name="location_type")
SESSION_STATUS = sa.Enum("SCHEDULED", "ACTIVE", "CLOSED", "CANCELLED", name="session_status")
ATTENDANCE_STATUS = sa.Enum(
    "PRESENT", "LATE", "ABSENT", "CHECKED_OUT", "INCOMPLETE", "MANUALLY_APPROVED", "REJECTED",
    name="attendance_status",
)
VERIFICATION_METHOD = sa.Enum("face_gps", "manual", name="verification_method")
RECORD_SOURCE = sa.Enum("online", "offline_sync", name="record_source")
CHALLENGE_TYPE = sa.Enum(
    "BLINK_TWICE", "TURN_LEFT", "TURN_RIGHT", "SMILE", "LOOK_STRAIGHT",
    name="liveness_challenge_type",
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("role", USER_ROLE, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "students",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registration_number", sa.String(50), nullable=False),
        sa.Column("course_of_study", sa.String(120)),
        sa.Column("year_of_study", sa.Integer()),
        sa.Column("consent_given_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_student_user"),
    )
    op.create_index("ix_students_regno", "students", ["registration_number"], unique=True)

    op.create_table(
        "courses",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)

    op.create_table(
        "class_groups",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", pg.UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("course_id", "name", name="uq_class_course_name"),
    )

    op.create_table(
        "student_class_enrollments",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", pg.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_group_id", pg.UUID(as_uuid=True), sa.ForeignKey("class_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("student_id", "class_group_id", name="uq_student_class"),
    )

    op.create_table(
        "practical_locations",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("address", sa.String(300), nullable=False, server_default=""),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=False),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=False),
        sa.Column("radius_meters", sa.Integer(), nullable=False),
        sa.Column("location_type", LOCATION_TYPE, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("radius_meters > 0", name="ck_location_radius_positive"),
        sa.UniqueConstraint("name", name="uq_location_name"),
    )

    op.create_table(
        "attendance_sessions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("class_group_id", pg.UUID(as_uuid=True), sa.ForeignKey("class_groups.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("location_id", pg.UUID(as_uuid=True), sa.ForeignKey("practical_locations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False, server_default=""),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("check_in_open", sa.Time(), nullable=False),
        sa.Column("check_in_close", sa.Time(), nullable=False),
        sa.Column("expected_end", sa.Time(), nullable=False),
        sa.Column("late_threshold_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("status", SESSION_STATUS, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sessions_session_date", "attendance_sessions", ["session_date"])
    op.create_index("ix_sessions_status_date", "attendance_sessions", ["status", "session_date"])

    op.create_table(
        "face_enrollments",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", pg.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        # Encrypted embedding bytes (Fernet/AES) - raw vectors are never stored or returned
        sa.Column("embedding_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("embedding_dim", sa.Integer(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("mean_consistency", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("consent_given_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_face_enrollment_active_per_student",
        "face_enrollments",
        ["student_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.create_table(
        "location_verifications",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("token", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", pg.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", pg.UUID(as_uuid=True), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("distance_meters", sa.Float(), nullable=False),
        sa.Column("allowed_radius_meters", sa.Float(), nullable=False),
        sa.Column("accuracy_meters", sa.Float(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("token", name="uq_locverif_token"),
    )
    op.create_index("ix_locverif_student_session", "location_verifications", ["student_id", "session_id"])

    op.create_table(
        "face_verifications",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("challenge_token", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("token", pg.UUID(as_uuid=True)),
        sa.Column("student_id", pg.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", pg.UUID(as_uuid=True), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("challenge_type", CHALLENGE_TYPE, nullable=False),
        sa.Column("challenge_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("liveness_passed", sa.Boolean()),
        sa.Column("liveness_metrics", pg.JSONB()),
        sa.Column("similarity_score", sa.Float()),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("failure_reason", sa.String(64)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("challenge_token", name="uq_faceverif_challenge_token"),
        sa.UniqueConstraint("token", name="uq_faceverif_token"),
    )
    op.create_index("ix_faceverif_student_session", "face_verifications", ["student_id", "session_id"])

    op.create_table(
        "attendance_records",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", pg.UUID(as_uuid=True), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", pg.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("check_out_at", sa.DateTime(timezone=True)),
        sa.Column("minutes_late", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("time_spent_minutes", sa.Integer()),
        sa.Column("status", ATTENDANCE_STATUS, nullable=False),
        sa.Column("verification_method", VERIFICATION_METHOD, nullable=False, server_default="face_gps"),
        sa.Column("source", RECORD_SOURCE, nullable=False, server_default="online"),
        sa.Column("idempotency_key", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("session_id", "student_id", name="uq_attendance_session_student"),
        sa.UniqueConstraint("idempotency_key", name="uq_attendance_idempotency"),
    )
    op.create_index("ix_attendance_student", "attendance_records", ["student_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("entity_type", sa.String(60), nullable=False, server_default=""),
        sa.Column("entity_id", pg.UUID(as_uuid=True)),
        sa.Column("details", pg.JSONB()),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_actor_action", "audit_logs", ["actor_user_id", "action"])


def downgrade() -> None:
    for table in (
        "audit_logs", "attendance_records", "face_verifications", "location_verifications",
        "face_enrollments", "attendance_sessions", "practical_locations",
        "student_class_enrollments", "class_groups", "courses", "students", "users",
    ):
        op.drop_table(table)
    for enum_type in (CHALLENGE_TYPE, RECORD_SOURCE, VERIFICATION_METHOD, ATTENDANCE_STATUS,
                      SESSION_STATUS, LOCATION_TYPE, USER_ROLE):
        enum_type.drop(op.get_bind(), checkfirst=True)
