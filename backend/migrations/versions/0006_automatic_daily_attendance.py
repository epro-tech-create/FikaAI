"""Add course-independent automatic daily attendance sessions.

Revision ID: 0006
Revises: 0005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LOCATION_NAME = "DIT RAFIC Building"
LOCATION_ADDRESS = "Dar es Salaam Institute of Technology, RAFIC Building"


def upgrade() -> None:
    op.drop_constraint(
        "fk_session_instructor_course_assignment",
        "attendance_sessions",
        type_="foreignkey",
    )
    op.alter_column("attendance_sessions", "course_id", nullable=True)
    op.alter_column("attendance_sessions", "instructor_id", nullable=True)
    op.add_column(
        "attendance_sessions",
        sa.Column("is_automatic", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "uq_attendance_sessions_automatic_date",
        "attendance_sessions",
        ["session_date"],
        unique=True,
        postgresql_where=sa.text("is_automatic"),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO practical_locations
                (id, name, address, latitude, longitude, radius_meters,
                 location_type, is_active, created_at, updated_at)
            VALUES
                (md5(:name)::uuid, :name, :address, -6.8137482, 39.2801352, 100,
                 'classroom'::location_type, true, now(), now())
            ON CONFLICT (name) DO UPDATE SET
                address = EXCLUDED.address,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                radius_meters = EXCLUDED.radius_meters,
                location_type = EXCLUDED.location_type,
                is_active = true,
                updated_at = now()
            """
        ).bindparams(name=LOCATION_NAME, address=LOCATION_ADDRESS)
    )


def downgrade() -> None:
    # Automatic rows cannot satisfy the legacy mandatory assignment constraint.
    op.execute(sa.text("DELETE FROM attendance_sessions WHERE is_automatic"))
    op.drop_index("uq_attendance_sessions_automatic_date", table_name="attendance_sessions")
    op.drop_column("attendance_sessions", "is_automatic")
    op.alter_column("attendance_sessions", "instructor_id", nullable=False)
    op.alter_column("attendance_sessions", "course_id", nullable=False)
    op.create_foreign_key(
        "fk_session_instructor_course_assignment",
        "attendance_sessions",
        "instructor_course_assignments",
        ["instructor_id", "course_id"],
        ["instructor_id", "course_id"],
        ondelete="RESTRICT",
    )
