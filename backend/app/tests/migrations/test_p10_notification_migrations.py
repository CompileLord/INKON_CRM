from pathlib import Path

from alembic.config import Config
from alembic.script import Script, ScriptDirectory


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]


def test_notification_migrations_are_single_expand_only_chain() -> None:
    script: ScriptDirectory = ScriptDirectory.from_config(Config(str(BACKEND_ROOT / "alembic.ini")))
    amount: Script | None = script.get_revision("p10_notification_amount")
    retry: Script | None = script.get_revision("p10_notification_retry")
    assert amount is not None and amount.down_revision == "p7_payment_targets"
    assert retry is not None and retry.down_revision == "p10_notification_amount"
    name: str
    for name in ("p10_notification_amount", "p10_notification_retry"):
        source: str = (BACKEND_ROOT / "alembic/versions" / f"{name}.py").read_text().split("def downgrade")[0]
        assert "nullable=True" in source
        assert "drop_" not in source and "alter_column" not in source
