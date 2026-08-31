"""Add static 8-char venue proof (VENUE_GPS) for CCD-Attendance.

Revision ID: 0007
Revises: 0006
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend verification_method enum for VENUE_GPS
    op.execute(sa.text("ALTER TYPE verification_method ADD VALUE IF NOT EXISTS 'venue_gps'"))
    # Create venue_verifications table (mirrors location_verifications)
    op.create_table(
        "venue_verifications",
        sa.Column("id", sa.UUID(), nullable=False, primary_key=True),
        sa.Column("token", sa.UUID(), nullable=False, unique=True),
        sa.Column("student_id", sa.UUID(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.UUID(), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_venueverif_student_session", "venue_verifications", ["student_id", "session_id"])


def downgrade() -> None:
    op.drop_index("ix_venueverif_student_session", table_name="venue_verifications")
    op.drop_table("venue_verifications")
    # Enum value removal requires recreate — leave 'venue_gps' for safety
