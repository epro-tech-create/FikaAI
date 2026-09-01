"""Remove courses, course assignments, and student course_of_study.

Revision ID: 0009
Revises: 0008
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("fk_attendance_sessions_course", "attendance_sessions", type_="foreignkey")
    op.drop_index("ix_attendance_sessions_course_id", table_name="attendance_sessions")
    op.drop_column("attendance_sessions", "course_id")
    op.drop_table("instructor_course_assignments")
    op.drop_index("ix_courses_code", table_name="courses")
    op.drop_table("courses")
    op.drop_column("students", "course_of_study")


def downgrade() -> None:
    op.add_column("students", sa.Column("course_of_study", sa.String(length=120), nullable=True))
    op.create_table(
        "courses",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)
    op.create_table(
        "instructor_course_assignments",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("instructor_id", pg.UUID(as_uuid=True), sa.ForeignKey("instructors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", pg.UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("instructor_id", "course_id", name="uq_instructor_course"),
    )
    op.add_column("attendance_sessions", sa.Column("course_id", pg.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_attendance_sessions_course_id", "attendance_sessions", ["course_id"])
    op.create_foreign_key(
        "fk_attendance_sessions_course",
        "attendance_sessions",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="RESTRICT",
    )
