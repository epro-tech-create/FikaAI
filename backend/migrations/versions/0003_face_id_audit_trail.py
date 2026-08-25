"""Link face verifications and attendance records to enrolled FaceIDs.

Revision ID: 0003
Revises: 0002
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("face_verifications", sa.Column("face_enrollment_id", pg.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_face_verifications_enrollment",
        "face_verifications",
        "face_enrollments",
        ["face_enrollment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_face_verifications_enrollment", "face_verifications", ["face_enrollment_id"])

    op.add_column("attendance_records", sa.Column("face_enrollment_id", pg.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_attendance_records_enrollment",
        "attendance_records",
        "face_enrollments",
        ["face_enrollment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_attendance_records_enrollment", "attendance_records", ["face_enrollment_id"])


def downgrade() -> None:
    op.drop_index("ix_attendance_records_enrollment", table_name="attendance_records")
    op.drop_constraint("fk_attendance_records_enrollment", "attendance_records", type_="foreignkey")
    op.drop_column("attendance_records", "face_enrollment_id")
    op.drop_index("ix_face_verifications_enrollment", table_name="face_verifications")
    op.drop_constraint("fk_face_verifications_enrollment", "face_verifications", type_="foreignkey")
    op.drop_column("face_verifications", "face_enrollment_id")
