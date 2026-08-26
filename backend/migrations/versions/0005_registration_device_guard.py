"""Record registration devices and client IPs.

Revision ID: 0005
Revises: 0004
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("students", sa.Column("registration_device_hash", sa.String(64), nullable=True))
    op.add_column("students", sa.Column("registration_ip", sa.String(45), nullable=True))
    op.create_index(
        "uq_students_registration_device_hash",
        "students",
        ["registration_device_hash"],
        unique=True,
        postgresql_where=sa.text("registration_device_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_students_registration_device_hash", table_name="students")
    op.drop_column("students", "registration_ip")
    op.drop_column("students", "registration_device_hash")
