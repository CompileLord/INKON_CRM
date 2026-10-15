from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa17c2e9b041"
down_revision: Union[str, None] = "e1f7a8c9d0b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "auth_version",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.execute(sa.text("LOCK TABLE users IN ACCESS EXCLUSIVE MODE"))
    auth_version_column = sa.column("auth_version", sa.Integer())
    users_table = sa.table("users", auth_version_column)
    nonzero_auth_version_count: int = op.get_bind().scalar(
        sa.select(sa.func.count())
        .select_from(users_table)
        .where(auth_version_column > 0)
    ) or 0
    if nonzero_auth_version_count:
        raise RuntimeError("Cannot downgrade auth_version while credential revocations exist")
    op.drop_column("users", "auth_version")
