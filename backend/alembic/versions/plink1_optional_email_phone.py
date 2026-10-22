from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "plink1_optional_email_phone"
down_revision: str = "rwp64_roster_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME: str = "ux_users_phone_live"
LIVE_PHONE_PREDICATE: str = "is_deleted = false AND phone IS NOT NULL"


def upgrade() -> None:
    if not op.get_context().as_sql:
        duplicate_count: int = op.get_bind().execute(sa.text(
            "SELECT COALESCE(SUM(group_size), 0) FROM ("
            "SELECT count(*) AS group_size FROM users WHERE " + LIVE_PHONE_PREDICATE +
            " GROUP BY phone HAVING count(*) > 1) AS duplicate_groups"
        )).scalar_one()
        if duplicate_count:
            raise RuntimeError(
                f"Cannot make users.phone unique: {duplicate_count} live users share a phone number. "
                "Resolve the duplicates, then rerun the upgrade."
            )
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=True)
    with op.get_context().autocommit_block():
        if not op.get_context().as_sql:
            valid: bool | None = op.get_bind().execute(
                sa.text("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:index_name)"),
                {"index_name": INDEX_NAME},
            ).scalar_one_or_none()
            if valid is False:
                op.drop_index(
                    INDEX_NAME,
                    table_name="users",
                    postgresql_concurrently=True,
                    if_exists=True,
                )
        op.create_index(
            INDEX_NAME,
            "users",
            ["phone"],
            unique=True,
            postgresql_where=sa.text(LIVE_PHONE_PREDICATE),
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    if not op.get_context().as_sql:
        missing_email_count: int = op.get_bind().execute(
            sa.text("SELECT count(*) FROM users WHERE email IS NULL")
        ).scalar_one()
        if missing_email_count:
            raise RuntimeError(
                f"Cannot restore NOT NULL on users.email: {missing_email_count} users have no email. "
                "Give them an email or delete them, then rerun the downgrade."
            )
    with op.get_context().autocommit_block():
        op.drop_index(
            INDEX_NAME,
            table_name="users",
            postgresql_concurrently=True,
            if_exists=True,
        )
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=False)
