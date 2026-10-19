from typing import Any
from alembic import op
import sqlalchemy as sa

revision: str = "rwp30_delivery_claims"
down_revision: str = "be3a1b2c3d4e"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    existing_names: set[str] = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("notification_logs")}
    columns: list[sa.Column[Any]] = [
        sa.Column("delivery_state", sa.String(20), nullable=True),
        sa.Column("delivery_text", sa.Text(), nullable=True),
        sa.Column("is_terminal", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("revision", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("delivery_score", sa.Integer(), nullable=True),
        sa.Column("claim_token", sa.String(64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
    ]
    column: sa.Column[Any]
    for column in columns:
        if column.name not in existing_names:
            op.add_column("notification_logs", column)


def downgrade() -> None:
    return None
