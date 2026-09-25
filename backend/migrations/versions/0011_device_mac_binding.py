"""Bind attendance to MAC / device fingerprint.

Revision ID: 0011
Revises: 0010
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "students", sa.Column("registration_mac_hash", sa.String(64), nullable=True)
    )
    op.create_index(
        "uq_students_registration_mac_hash",
        "students",
        ["registration_mac_hash"],
        unique=True,
        postgresql_where=sa.text("registration_mac_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_students_registration_mac_hash", table_name="students")
    op.drop_column("students", "registration_mac_hash")
