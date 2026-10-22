import bcrypt
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.security import hash_password, verify_password


class TestPasswordBcryptRounds:
    @pytest.mark.parametrize("environment", ["development", "staging", "production", "testing"])
    def test_default_cost_is_twelve(self, monkeypatch: pytest.MonkeyPatch, environment: str) -> None:
        monkeypatch.delenv("PASSWORD_BCRYPT_ROUNDS", raising=False)
        configured: Settings = Settings(
            _env_file=None,
            ENVIRONMENT=environment,
            TESTING=False,
            OUTBOX_ENCRYPTION_KEYS=f"v1:{'11' * 32}",
            TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook",
        )
        assert configured.PASSWORD_BCRYPT_ROUNDS == 12

    @pytest.mark.parametrize("environment", ["production", "staging", "development"])
    @pytest.mark.parametrize("rounds", [4, 11])
    def test_non_test_environments_reject_low_cost(self, environment: str, rounds: int) -> None:
        with pytest.raises(ValidationError, match="PASSWORD_BCRYPT_ROUNDS"):
            Settings(
                _env_file=None,
                ENVIRONMENT=environment,
                TESTING=False,
                PASSWORD_BCRYPT_ROUNDS=rounds,
                OUTBOX_ENCRYPTION_KEYS=f"v1:{'11' * 32}",
                TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook",
            )

    @pytest.mark.parametrize("environment", ["production", "staging"])
    def test_deployed_environments_cannot_bypass_minimum_with_testing_flag(self, environment: str) -> None:
        with pytest.raises(ValidationError, match="PASSWORD_BCRYPT_ROUNDS"):
            Settings(
                _env_file=None,
                ENVIRONMENT=environment,
                TESTING=True,
                PASSWORD_BCRYPT_ROUNDS=4,
                OUTBOX_ENCRYPTION_KEYS=f"v1:{'11' * 32}",
                TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook",
            )

    @pytest.mark.parametrize("environment,testing", [("testing", False), ("development", True)])
    @pytest.mark.parametrize("rounds", [4, 12, 31])
    def test_testing_allows_valid_costs(self, environment: str, testing: bool, rounds: int) -> None:
        configured: Settings = Settings(
            _env_file=None,
            ENVIRONMENT=environment,
            TESTING=testing,
            PASSWORD_BCRYPT_ROUNDS=rounds,
            TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook",
        )
        assert configured.PASSWORD_BCRYPT_ROUNDS == rounds

    @pytest.mark.parametrize("rounds", [3, 32])
    def test_testing_rejects_out_of_range_costs(self, rounds: int) -> None:
        with pytest.raises(ValidationError, match="PASSWORD_BCRYPT_ROUNDS"):
            Settings(_env_file=None, ENVIRONMENT="testing", TESTING=True, PASSWORD_BCRYPT_ROUNDS=rounds)

    @pytest.mark.parametrize("rounds", [4, 5, 12])
    def test_hash_uses_configured_cost(self, monkeypatch: pytest.MonkeyPatch, rounds: int) -> None:
        monkeypatch.setattr(settings, "PASSWORD_BCRYPT_ROUNDS", rounds)
        encoded: str = hash_password("test-password")
        assert encoded.startswith(f"$2b${rounds:02d}$")
        assert verify_password("test-password", encoded)

    def test_existing_cost_twelve_hash_verifies_at_test_cost(self) -> None:
        assert settings.PASSWORD_BCRYPT_ROUNDS == 4
        encoded: str = bcrypt.hashpw(b"existing-password", bcrypt.gensalt(rounds=12)).decode("utf-8")
        assert encoded.startswith("$2b$12$")
        assert verify_password("existing-password", encoded)
        assert not verify_password("incorrect-password", encoded)
