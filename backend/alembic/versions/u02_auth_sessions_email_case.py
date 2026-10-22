from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "u02_auth_sessions_email_case"
down_revision: str = "wp69a_payment_idempotency"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMAIL_INDEX_NAME: str = "ux_users_email_lower_live"
FAMILY_INDEX_NAME: str = "ix_refresh_tokens_family_id"


def drop_invalid_index(index_name: str, table_name: str) -> None:
    if op.get_context().as_sql:
        return
    valid: bool | None = op.get_bind().execute(
        sa.text("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:index_name)"),
        {"index_name": index_name},
    ).scalar_one_or_none()
    if valid is False:
        op.drop_index(index_name, table_name=table_name, postgresql_concurrently=True, if_exists=True)


def upgrade() -> None:
    op.execute("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id VARCHAR(36)")
    op.execute("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMP WITH TIME ZONE")
    if not op.get_context().as_sql:
        collisions = op.get_bind().execute(
            sa.text(
                "SELECT lower(btrim(email)) AS normalized_email, array_agg(id ORDER BY id) AS user_ids "
                "FROM users WHERE is_deleted = false AND email IS NOT NULL "
                "GROUP BY lower(btrim(email)) HAVING count(*) > 1"
            )
        ).all()
        if collisions:
            details: str = "; ".join(f"{row.normalized_email}: ids {list(row.user_ids)}" for row in collisions)
            raise RuntimeError(
                "Cannot enforce case-insensitive unique emails; resolve these colliding live users manually "
                f"(accounts are never merged automatically): {details}"
            )
    op.execute(
        "UPDATE users AS target SET email = lower(btrim(target.email)) "
        "WHERE target.email IS NOT NULL AND target.email <> lower(btrim(target.email)) "
        "AND NOT EXISTS ("
        "SELECT 1 FROM users AS other WHERE other.id <> target.id "
        "AND lower(btrim(other.email)) = lower(btrim(target.email)))"
    )
    with op.get_context().autocommit_block():
        drop_invalid_index(EMAIL_INDEX_NAME, "users")
        op.create_index(
            EMAIL_INDEX_NAME,
            "users",
            [sa.text("lower(email)")],
            unique=True,
            postgresql_where=sa.text("is_deleted = false AND email IS NOT NULL"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        drop_invalid_index(FAMILY_INDEX_NAME, "refresh_tokens")
        op.create_index(
            FAMILY_INDEX_NAME,
            "refresh_tokens",
            ["family_id"],
            postgresql_where=sa.text("family_id IS NOT NULL"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(FAMILY_INDEX_NAME, table_name="refresh_tokens", postgresql_concurrently=True, if_exists=True)
        op.drop_index(EMAIL_INDEX_NAME, table_name="users", postgresql_concurrently=True, if_exists=True)
    op.execute("ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS rotated_at")
    op.execute("ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS family_id")
