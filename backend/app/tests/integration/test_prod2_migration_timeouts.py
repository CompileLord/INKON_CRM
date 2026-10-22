import runpy
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
from alembic import context
from sqlalchemy.engine import Connection


class TestMigrationConnectionTimeouts:
    @pytest.mark.parametrize("lock_ms,statement_ms", [(None, None), ("75", "6000")])
    def test_online_connections_receive_bounded_timeouts(
        self, monkeypatch: pytest.MonkeyPatch, lock_ms: str | None, statement_ms: str | None,
    ) -> None:
        configuration: MagicMock = MagicMock()
        configuration.config_file_name = None
        monkeypatch.setattr(context, "config", configuration, raising=False)
        monkeypatch.setattr(context, "is_offline_mode", lambda: True)
        monkeypatch.setattr(context, "configure", MagicMock())
        monkeypatch.setattr(context, "begin_transaction", MagicMock())
        monkeypatch.setattr(context, "run_migrations", MagicMock())
        if lock_ms is None:
            monkeypatch.delenv("MIGRATION_LOCK_TIMEOUT_MS", raising=False)
            monkeypatch.delenv("MIGRATION_STATEMENT_TIMEOUT_MS", raising=False)
        else:
            monkeypatch.setenv("MIGRATION_LOCK_TIMEOUT_MS", lock_ms)
            monkeypatch.setenv("MIGRATION_STATEMENT_TIMEOUT_MS", str(statement_ms))
        environment: dict[str, Any] = runpy.run_path(str(Path(__file__).parents[3] / "alembic" / "env.py"))
        connection: MagicMock = MagicMock(spec=Connection)
        environment["do_run_migrations"](connection)
        executions: list[Any] = connection.execute.call_args_list
        assert len(executions) == 2
        assert "lock_timeout" in str(executions[0].args[0])
        assert executions[0].args[1] == {"timeout": f"{lock_ms or '5000'}ms"}
        assert "statement_timeout" in str(executions[1].args[0])
        assert executions[1].args[1] == {"timeout": f"{statement_ms or '900000'}ms"}
        connection.commit.assert_called_once()
