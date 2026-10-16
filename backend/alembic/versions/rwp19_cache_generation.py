from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c91f0a4b7e19"
down_revision: str | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cache_generations",
        sa.Column("key", sa.String(64), primary_key=True, nullable=False),
        sa.Column("generation", sa.BigInteger(), nullable=False, server_default="0"),
        sa.CheckConstraint("generation >= 0", name="check_cache_generation_nonnegative"),
    )
    op.execute(sa.text("INSERT INTO cache_generations (key, generation) VALUES ('finance_analytics', 0)"))


def downgrade() -> None:
    op.drop_table("cache_generations")
