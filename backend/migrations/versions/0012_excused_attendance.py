"""Excused attendance with reason.

Revision ID: 0012
Revises: 0011
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # add EXCUSED to attendance_status enum (native_enum)
    op.execute("ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'EXCUSED'")
    op.add_column("attendance_records", sa.Column("excuse_reason", sa.String(500), nullable=True))
    op.add_column("attendance_records", sa.Column("excused_by", sa.UUID(), nullable=True))
    op.add_column("attendance_records", sa.Column("excused_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_attendance_records_excused_by", "attendance_records", "users", ["excused_by"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_attendance_records_excused_by", "attendance_records", type_="foreignkey")
    op.drop_column("attendance_records", "excused_at")
    op.drop_column("attendance_records", "excused_by")
    op.drop_column("attendance_records", "excuse_reason")
    # cannot easily remove enum value; leave EXCUSED
