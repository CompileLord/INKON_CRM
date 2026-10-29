import os

from alembic.config import Config
from alembic.script import Script, ScriptDirectory

BACKEND_ROOT: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
REVISION: str = "p4_enrollment_billing_mode"


def load_script() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(os.path.join(BACKEND_ROOT, "alembic.ini")))


def test_billing_mode_revision_extends_the_previous_head_and_stays_single_head() -> None:
    script: ScriptDirectory = load_script()
    revision: Script | None = script.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "u16_debt_reminder_sms"
    assert script.get_revision("p7_payment_targets").down_revision == REVISION


def test_billing_mode_migration_is_expand_only() -> None:
    source: str = open(os.path.join(BACKEND_ROOT, "alembic", "versions", f"{REVISION}.py")).read()
    assert "nullable=True" in source
    assert 'server_default="paid"' in source
    assert "UPDATE enrollments SET billing_mode = 'paid'" in source
    assert "nullable=False" not in source
    assert "alter_column" not in source
