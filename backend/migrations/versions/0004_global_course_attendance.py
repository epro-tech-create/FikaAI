"""Replace class-scoped attendance with global course attendance.

Revision ID: 0004
Revises: 0003
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STUDENT_STATUS = sa.Enum("ACTIVE", "INACTIVE", name="student_status")
NEW_USER_ROLE = sa.Enum("admin", "instructor", "student", name="user_role")
OLD_USER_ROLE = sa.Enum("admin", "supervisor", "student", name="user_role")

LEGACY_USER_ID = "ff7a28b7-f906-571a-885b-32bb8393e59d"
LEGACY_INSTRUCTOR_ID = "669f4100-bd94-5f00-aa6d-14f89139b29a"
LEGACY_EMAIL = "legacy-instructor-ff7a28b7@invalid.fikaai.local"
LEGACY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$RmlrYUFJTGVnYWN5U2FsdA$"
    "8A6eD3jZzjFMvWqMsHfBPKKKuh1PmQY+qccpCP/V0kk"
)


def _replace_user_role(*, source_type: str, target: sa.Enum, role_from: str, role_to: str) -> None:
    """Replace a PostgreSQL enum without relying on ALTER VALUE semantics."""
    op.execute(sa.text(f"ALTER TYPE user_role RENAME TO {source_type}"))
    target.create(op.get_bind(), checkfirst=False)
    op.execute(
        sa.text(
            f"""
            ALTER TABLE users
            ALTER COLUMN role TYPE user_role
            USING (
                CASE WHEN role::text = '{role_from}' THEN '{role_to}' ELSE role::text END
            )::user_role
            """
        )
    )
    op.execute(sa.text(f"DROP TYPE {source_type}"))


def upgrade() -> None:
    _replace_user_role(
        source_type="user_role_legacy_0004",
        target=NEW_USER_ROLE,
        role_from="supervisor",
        role_to="instructor",
    )

    STUDENT_STATUS.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "students",
        sa.Column(
            "status",
            STUDENT_STATUS,
            nullable=False,
            server_default=sa.text("'ACTIVE'::student_status"),
        ),
    )
    op.create_index("ix_students_status", "students", ["status"])

    op.create_table(
        "instructors",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_instructor_user"),
    )
    op.create_index("ix_instructors_user_id", "instructors", ["user_id"])

    # Reusing the user UUID keeps migrated profile IDs deterministic.
    op.execute(
        sa.text(
            """
            INSERT INTO instructors (id, user_id, created_at, updated_at)
            SELECT id, id, created_at, updated_at
            FROM users
            WHERE role = 'instructor'::user_role
            """
        )
    )

    # A pre-0004 session has no owner. Only create a disabled placeholder when
    # there is data to preserve and no real migrated instructor can own it.
    op.execute(
        sa.text(
            """
            INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
            SELECT CAST(:user_id AS uuid), :email, :password_hash,
                   'Legacy session owner', 'instructor'::user_role, false, now(), now()
            WHERE EXISTS (SELECT 1 FROM attendance_sessions)
              AND NOT EXISTS (SELECT 1 FROM instructors)
            """
        ).bindparams(user_id=LEGACY_USER_ID, email=LEGACY_EMAIL, password_hash=LEGACY_PASSWORD_HASH)
    )
    op.execute(
        sa.text(
            """
            INSERT INTO instructors (id, user_id, created_at, updated_at)
            SELECT CAST(:instructor_id AS uuid), CAST(:user_id AS uuid), now(), now()
            WHERE EXISTS (
                SELECT 1 FROM users
                WHERE id = CAST(:user_id AS uuid) AND email = :email
            )
              AND NOT EXISTS (SELECT 1 FROM instructors)
            """
        ).bindparams(instructor_id=LEGACY_INSTRUCTOR_ID, user_id=LEGACY_USER_ID, email=LEGACY_EMAIL)
    )

    op.create_table(
        "instructor_course_assignments",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "instructor_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("instructors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("instructor_id", "course_id", name="uq_instructor_course"),
    )
    op.create_index(
        "ix_instructor_course_assignments_instructor_id",
        "instructor_course_assignments",
        ["instructor_id"],
    )
    op.create_index(
        "ix_instructor_course_assignments_course_id",
        "instructor_course_assignments",
        ["course_id"],
    )
    op.execute(
        sa.text(
            """
            INSERT INTO instructor_course_assignments
                (id, instructor_id, course_id, created_at, updated_at)
            SELECT md5(i.id::text || ':' || c.id::text)::uuid, i.id, c.id, now(), now()
            FROM instructors AS i
            CROSS JOIN courses AS c
            """
        )
    )

    op.add_column("attendance_sessions", sa.Column("course_id", pg.UUID(as_uuid=True), nullable=True))
    op.add_column("attendance_sessions", sa.Column("instructor_id", pg.UUID(as_uuid=True), nullable=True))
    op.add_column("attendance_sessions", sa.Column("official_start", sa.Time(), nullable=True))
    op.add_column("attendance_sessions", sa.Column("check_out_close", sa.Time(), nullable=True))
    op.add_column("attendance_sessions", sa.Column("permitted_radius_meters", sa.Integer(), nullable=True))
    op.add_column(
        "attendance_sessions",
        sa.Column("instructions", sa.String(500), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE attendance_sessions AS s
            SET course_id = cg.course_id,
                instructor_id = (
                    SELECT i.id
                    FROM instructors AS i
                    JOIN users AS u ON u.id = i.user_id
                    ORDER BY u.is_active DESC, u.created_at ASC, i.id ASC
                    LIMIT 1
                ),
                official_start = s.check_in_open,
                check_out_close = GREATEST(s.expected_end, s.check_in_close),
                permitted_radius_meters = l.radius_meters,
                instructions = NULL
            FROM class_groups AS cg, practical_locations AS l
            WHERE cg.id = s.class_group_id
              AND l.id = s.location_id
            """
        )
    )

    for column in (
        "course_id",
        "instructor_id",
        "official_start",
        "check_out_close",
        "permitted_radius_meters",
    ):
        op.alter_column("attendance_sessions", column, nullable=False)

    op.create_foreign_key(
        "fk_attendance_sessions_course",
        "attendance_sessions",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_attendance_sessions_instructor",
        "attendance_sessions",
        "instructors",
        ["instructor_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_session_instructor_course_assignment",
        "attendance_sessions",
        "instructor_course_assignments",
        ["instructor_id", "course_id"],
        ["instructor_id", "course_id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_attendance_sessions_course_id", "attendance_sessions", ["course_id"])
    op.create_index("ix_attendance_sessions_instructor_id", "attendance_sessions", ["instructor_id"])
    op.create_check_constraint(
        "ck_session_radius_positive",
        "attendance_sessions",
        "permitted_radius_meters > 0",
    )

    op.drop_constraint("attendance_sessions_class_group_id_fkey", "attendance_sessions", type_="foreignkey")
    op.drop_column("attendance_sessions", "class_group_id")
    op.drop_table("student_class_enrollments")
    op.drop_table("class_groups")


def downgrade() -> None:
    op.create_table(
        "class_groups",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "course_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "default_location_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("practical_locations.id", ondelete="SET NULL", name="fk_class_groups_default_location"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("course_id", "name", name="uq_class_course_name"),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO class_groups
                (id, course_id, name, default_location_id, created_at, updated_at)
            SELECT md5('downgrade-class:' || c.id::text)::uuid,
                   c.id,
                   'Migrated course group',
                   (
                       SELECT s.location_id
                       FROM attendance_sessions AS s
                       WHERE s.course_id = c.id
                       ORDER BY s.created_at ASC, s.id ASC
                       LIMIT 1
                   ),
                   now(), now()
            FROM courses AS c
            """
        )
    )

    op.create_table(
        "student_class_enrollments",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "student_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "class_group_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("class_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("student_id", "class_group_id", name="uq_student_class"),
    )
    # 0004 makes students globally eligible. Enrolling every student in every
    # reconstructed group is the closest lossless representation in 0003.
    op.execute(
        sa.text(
            """
            INSERT INTO student_class_enrollments
                (id, student_id, class_group_id, enrolled_at, created_at, updated_at)
            SELECT md5(s.id::text || ':' || cg.id::text)::uuid,
                   s.id, cg.id, now(), now(), now()
            FROM students AS s
            CROSS JOIN class_groups AS cg
            """
        )
    )

    op.add_column("attendance_sessions", sa.Column("class_group_id", pg.UUID(as_uuid=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE attendance_sessions AS s
            SET class_group_id = cg.id
            FROM class_groups AS cg
            WHERE cg.course_id = s.course_id
            """
        )
    )
    op.alter_column("attendance_sessions", "class_group_id", nullable=False)
    op.create_foreign_key(
        "attendance_sessions_class_group_id_fkey",
        "attendance_sessions",
        "class_groups",
        ["class_group_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.drop_constraint("ck_session_radius_positive", "attendance_sessions", type_="check")
    op.drop_constraint("fk_session_instructor_course_assignment", "attendance_sessions", type_="foreignkey")
    op.drop_index("ix_attendance_sessions_instructor_id", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_course_id", table_name="attendance_sessions")
    op.drop_constraint("fk_attendance_sessions_instructor", "attendance_sessions", type_="foreignkey")
    op.drop_constraint("fk_attendance_sessions_course", "attendance_sessions", type_="foreignkey")
    for column in (
        "instructions",
        "permitted_radius_meters",
        "check_out_close",
        "official_start",
        "instructor_id",
        "course_id",
    ):
        op.drop_column("attendance_sessions", column)

    op.drop_table("instructor_course_assignments")
    op.drop_table("instructors")
    op.execute(
        sa.text(
            """
            DELETE FROM users
            WHERE id = CAST(:user_id AS uuid)
              AND email = :email
              AND is_active = false
            """
        ).bindparams(user_id=LEGACY_USER_ID, email=LEGACY_EMAIL)
    )

    op.drop_index("ix_students_status", table_name="students")
    op.drop_column("students", "status")
    STUDENT_STATUS.drop(op.get_bind(), checkfirst=True)

    _replace_user_role(
        source_type="user_role_new_0004",
        target=OLD_USER_ROLE,
        role_from="instructor",
        role_to="supervisor",
    )
