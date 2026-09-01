"""Add CCD membership ID as the public student ID.

Revision ID: 0008
Revises: 0007
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("students", sa.Column("membership_id", sa.String(length=30), nullable=True))
    op.create_index(
        "uq_students_membership_id",
        "students",
        ["membership_id"],
        unique=True,
        postgresql_where=sa.text("membership_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_students_membership_id", table_name="students")
    op.drop_column("students", "membership_id")
