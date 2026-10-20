from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseConnectionPolicy(BaseModel):
    model_config: ConfigDict = ConfigDict(hide_input_in_errors=True)

    DB_CONNECTION_BUDGET: int = Field(default=100, ge=1, le=100)
    DB_API_PROCESSES: int = Field(default=1, ge=1, le=1)
    DB_WORKER_PROCESSES: int = Field(default=1, ge=1, le=1)
    DB_REVISION_OVERLAP: int = Field(default=2, ge=1, le=2)
    DB_ADMIN_RESERVE: int = Field(default=10, ge=1)
    DB_MAINTENANCE_CONNECTIONS: int = Field(default=2, ge=1)
    DB_POOL_SIZE: int = Field(default=8, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=2, ge=0)
    DB_POOL_TIMEOUT_SECONDS: float = Field(default=5, gt=0, allow_inf_nan=False)
    DB_OUTBOX_POOL_SIZE: int = Field(default=2, ge=1)
    DB_OUTBOX_MAX_OVERFLOW: int = Field(default=0, ge=0)
    DB_STATEMENT_TIMEOUT_MS: int = Field(default=15000, gt=0)
    DB_LOCK_TIMEOUT_MS: int = Field(default=2000, gt=0)
    DB_IDLE_TRANSACTION_TIMEOUT_MS: int = Field(default=15000, gt=0)
    DB_MAINTENANCE_STATEMENT_TIMEOUT_MS: int = Field(default=300000, gt=0)
    DB_MAINTENANCE_LOCK_TIMEOUT_MS: int = Field(default=10000, gt=0)
    DB_MAINTENANCE_IDLE_TRANSACTION_TIMEOUT_MS: int = Field(default=300000, gt=0)

    @property
    def revision_ceiling(self) -> int:
        main_ceiling: int = self.DB_POOL_SIZE + self.DB_MAX_OVERFLOW
        storage_intent_ceiling: int = 1
        outbox_ceiling: int = self.DB_OUTBOX_POOL_SIZE + self.DB_OUTBOX_MAX_OVERFLOW
        return (self.DB_API_PROCESSES + self.DB_WORKER_PROCESSES) * (main_ceiling + storage_intent_ceiling) + self.DB_WORKER_PROCESSES * outbox_ceiling

    @property
    def deployment_ceiling(self) -> int:
        return self.revision_ceiling * self.DB_REVISION_OVERLAP + self.DB_MAINTENANCE_CONNECTIONS + self.DB_ADMIN_RESERVE

    @model_validator(mode="after")
    def validate_budget(self) -> Self:
        if self.deployment_ceiling > self.DB_CONNECTION_BUDGET:
            raise ValueError("Configured connection ceilings exceed the deployment database budget")
        if self.DB_LOCK_TIMEOUT_MS > self.DB_STATEMENT_TIMEOUT_MS:
            raise ValueError("Lock timeout must not exceed statement timeout")
        if self.DB_MAINTENANCE_LOCK_TIMEOUT_MS > self.DB_MAINTENANCE_STATEMENT_TIMEOUT_MS:
            raise ValueError("Maintenance lock timeout must not exceed maintenance statement timeout")
        if self.DB_MAINTENANCE_STATEMENT_TIMEOUT_MS <= self.DB_STATEMENT_TIMEOUT_MS:
            raise ValueError("Maintenance statement timeout must exceed request statement timeout")
        return self

    def server_settings(self, maintenance: bool = False) -> dict[str, str]:
        if maintenance:
            return {
                "statement_timeout": str(self.DB_MAINTENANCE_STATEMENT_TIMEOUT_MS),
                "lock_timeout": str(self.DB_MAINTENANCE_LOCK_TIMEOUT_MS),
                "idle_in_transaction_session_timeout": str(self.DB_MAINTENANCE_IDLE_TRANSACTION_TIMEOUT_MS),
            }
        return {
            "statement_timeout": str(self.DB_STATEMENT_TIMEOUT_MS),
            "lock_timeout": str(self.DB_LOCK_TIMEOUT_MS),
            "idle_in_transaction_session_timeout": str(self.DB_IDLE_TRANSACTION_TIMEOUT_MS),
        }

    def main_engine_options(self, outbox: bool = False) -> dict[str, Any]:
        return {
            "pool_size": self.DB_OUTBOX_POOL_SIZE if outbox else self.DB_POOL_SIZE,
            "max_overflow": self.DB_OUTBOX_MAX_OVERFLOW if outbox else self.DB_MAX_OVERFLOW,
            "pool_timeout": self.DB_POOL_TIMEOUT_SECONDS,
            "pool_recycle": 1800,
            "pool_pre_ping": True,
            "connect_args": {"server_settings": self.server_settings()},
        }


class DatabaseDeploymentSettings(BaseSettings, DatabaseConnectionPolicy):
    model_config: SettingsConfigDict = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore", hide_input_in_errors=True)

    @classmethod
    def validate_environment(cls) -> None:
        policy: DatabaseDeploymentSettings = cls()
        print(f"Database configured ceiling: {policy.deployment_ceiling}/{policy.DB_CONNECTION_BUDGET}; revision ceiling: {policy.revision_ceiling}")


if __name__ == "__main__":
    DatabaseDeploymentSettings.validate_environment()
