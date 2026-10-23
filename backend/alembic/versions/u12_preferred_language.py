from alembic import op
import sqlalchemy as sa

revision: str = "u12_preferred_language"
down_revision: str = "u02_auth_sessions_email_case"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferred_language", sa.String(length=2), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferred_language")
