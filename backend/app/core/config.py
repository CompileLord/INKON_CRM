import ipaddress
import re
from typing import Any, List, Optional, Union
from urllib.parse import urlsplit
from pydantic import BeforeValidator, Field, ValidationError, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Annotated
from app.db.connection_policy import DatabaseConnectionPolicy


def parse_cors_origins(value: Union[str, List[str]]) -> List[str]:
    if isinstance(value, str):
        if not value.strip():
            return []
        import json
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(origin) for origin in parsed]
        except json.JSONDecodeError:
            return [origin.strip() for origin in value.split(",")]
    return value


class Settings(BaseSettings, DatabaseConnectionPolicy):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
    )

    def __init__(self, **values: Any) -> None:
        try:
            super().__init__(**values)
        except ValidationError as validation_error:
            webhook_error: bool = any(
                error["loc"] == ("TELEGRAM_WEBHOOK_URL",)
                for error in validation_error.errors()
            )
            if webhook_error:
                raise ValueError("TELEGRAM_WEBHOOK_URL configuration is invalid") from None
            raise

    ENVIRONMENT: str = "development"
    TESTING: bool = False
    ALLOW_EMAILLESS_USERS: bool = False

    @field_validator("TESTING")
    @classmethod
    def reject_production_testing(cls, value: bool, info: ValidationInfo) -> bool:
        if value and info.data.get("ENVIRONMENT") == "production":
            raise ValueError("TESTING must be false in production")
        return value

    PAYMENT_FUTURE_TOLERANCE_MINUTES: int = Field(default=5, ge=0, le=1440)
    PAYMENT_BEFORE_ENROLLMENT_TOLERANCE_DAYS: int = Field(default=31, ge=0, le=3660)

    PASSWORD_BCRYPT_ROUNDS: int = Field(default=12, ge=4, le=31)

    @field_validator("PASSWORD_BCRYPT_ROUNDS")
    @classmethod
    def validate_password_bcrypt_rounds(cls, value: int, info: ValidationInfo) -> int:
        environment: str = info.data.get("ENVIRONMENT", "development")
        testing: bool = info.data.get("TESTING", False) or environment == "testing"
        if value < 12 and (environment in {"production", "staging"} or not testing):
            raise ValueError("PASSWORD_BCRYPT_ROUNDS must be at least 12 outside testing")
        return value

    OUTBOX_ENCRYPTION_KEYS: str = Field(default="", repr=False, exclude=True, validate_default=True)

    @field_validator("OUTBOX_ENCRYPTION_KEYS")
    @classmethod
    def validate_outbox_encryption_keys(cls, value: str, info: ValidationInfo) -> str:
        if not value.strip():
            if info.data.get("ENVIRONMENT") == "production":
                raise ValueError("OUTBOX_ENCRYPTION_KEYS is required in production")
            return ""
        versions: set[str] = set()
        entry: str
        for entry in value.split(","):
            version: str
            separator: str
            key: str
            version, separator, key = entry.strip().partition(":")
            if (
                not separator
                or re.fullmatch(r"v[1-9][0-9]*", version) is None
                or re.fullmatch(r"[0-9a-fA-F]{64}", key) is None
                or version in versions
            ):
                raise ValueError("OUTBOX_ENCRYPTION_KEYS must contain unique versions and 32-byte hexadecimal keys")
            versions.add(version)
        return value.strip()

    API_V1_STR: str = "/api/v1"

    JWT_SECRET_KEY: str
    JWT_REFRESH_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_REUSE_GRACE_SECONDS: int = Field(default=30, ge=0, le=300)

    AUTH_LOGIN_RATE_LIMIT: int = Field(default=30, gt=0)
    AUTH_LOGIN_RATE_WINDOW_SECONDS: int = Field(default=60, gt=0)
    AUTH_LOGIN_LOCKOUT_LIMIT: int = Field(default=5, gt=0)
    AUTH_LOGIN_LOCKOUT_WINDOW_SECONDS: int = Field(default=900, gt=0)
    AUTH_LOGIN_AGGREGATE_LIMIT: int = Field(default=300, gt=0)
    AUTH_LOGIN_AGGREGATE_WINDOW_SECONDS: int = Field(default=60, gt=0)

    AUTH_RESEND_COOLDOWN_SECONDS: int = Field(default=60, gt=0)
    AUTH_RESEND_ACCOUNT_LIMIT: int = Field(default=5, gt=0)
    AUTH_RESEND_ACCOUNT_WINDOW_SECONDS: int = Field(default=3600, gt=0)
    AUTH_RESEND_CLIENT_LIMIT: int = Field(default=10, gt=0)
    AUTH_RESEND_CLIENT_WINDOW_SECONDS: int = Field(default=3600, gt=0)
    AUTH_RESEND_AGGREGATE_LIMIT: int = Field(default=50, gt=0)
    AUTH_RESEND_AGGREGATE_WINDOW_SECONDS: int = Field(default=3600, gt=0)

    AUTH_VERIFY_RATE_LIMIT: int = Field(default=30, gt=0)
    AUTH_VERIFY_RATE_WINDOW_SECONDS: int = Field(default=60, gt=0)
    AUTH_VERIFY_LOCKOUT_LIMIT: int = Field(default=5, gt=0)
    AUTH_VERIFY_LOCKOUT_WINDOW_SECONDS: int = Field(default=900, gt=0)
    AUTH_VERIFY_AGGREGATE_LIMIT: int = Field(default=300, gt=0)
    AUTH_VERIFY_AGGREGATE_WINDOW_SECONDS: int = Field(default=60, gt=0)

    AUTH_RESET_REQUEST_LIMIT: int = Field(default=3, gt=0)
    AUTH_RESET_REQUEST_WINDOW_SECONDS: int = Field(default=3600, gt=0)
    AUTH_RESET_CLIENT_LIMIT: int = Field(default=10, gt=0)
    AUTH_RESET_CLIENT_WINDOW_SECONDS: int = Field(default=3600, gt=0)
    AUTH_RESET_AGGREGATE_LIMIT: int = Field(default=100, gt=0)
    AUTH_RESET_AGGREGATE_WINDOW_SECONDS: int = Field(default=3600, gt=0)

    SMS_PASSWORD_RESEND_COOLDOWN_SECONDS: int = Field(default=60, gt=0)
    SMS_PASSWORD_ACCOUNT_LIMIT: int = Field(default=5, gt=0)
    SMS_PASSWORD_ACCOUNT_WINDOW_SECONDS: int = Field(default=3600, gt=0)
    SMS_PASSWORD_PHONE_LIMIT: int = Field(default=10, gt=0)
    SMS_PASSWORD_PHONE_WINDOW_SECONDS: int = Field(default=3600, gt=0)

    SMS_PASSWORD_PHONE_DAILY_LIMIT: int = Field(default=10, gt=0)
    SMS_PASSWORD_IP_LIMIT: int = Field(default=100, gt=0)
    SMS_PASSWORD_IP_WINDOW_SECONDS: int = Field(default=3600, gt=0)
    SMS_PASSWORD_GLOBAL_DAILY_LIMIT: int = Field(default=1000, gt=0)
    SMS_PASSWORD_PENDING_TTL_SECONDS: int = Field(default=600, gt=0, le=3600)
    SMS_API_KEY: Optional[str] = Field(default=None, repr=False, exclude=True)
    SMS_BASE_URL: str = "https://api.payomchi.tj/api/v1"
    SMS_SENDER_ID: str = "KitobCRM"
    SMS_REQUEST_TIMEOUT_SECONDS: float = Field(default=10.0, gt=0)

    DATABASE_URL: str

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"

    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SMTP_FROM_EMAIL: str

    FRONTEND_BASE_URL: str = "https://crm.kitobedu.com"

    TIMEZONE: str = "Asia/Dushanbe"
    STORAGE_PATH: str = "storage"
    STORAGE_BACKEND: str = "local"
    PORT: int = 8080
    CRON_SECRET: Optional[str] = None
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_BOT_SECRET_TOKEN: str
    TELEGRAM_BOT_USERNAME: Optional[str] = None
    EXAM_RESULT_NOTIFICATION_DELAY_SECONDS: int = Field(default=14400, ge=0)
    TELEGRAM_WEBHOOK_URL: str = Field(
        default="http://localhost:8000/api/v1/telegram/webhook",
        validate_default=True,
    )

    @field_validator("TELEGRAM_WEBHOOK_URL")
    @classmethod
    def validate_telegram_webhook_url(cls, value: str, info: ValidationInfo) -> str:
        if info.data.get("TESTING", False):
            return value

        try:
            parsed_url = urlsplit(value)
            port: int | None = parsed_url.port
        except ValueError as error:
            raise ValueError("Telegram webhook must use public HTTPS when enabled") from error

        hostname = (parsed_url.hostname or "").lower()
        if hostname.endswith("..") or port == 0:
            raise ValueError("Telegram webhook must use public HTTPS when enabled")
        if hostname.endswith("."):
            hostname = hostname[:-1]
        if (
            parsed_url.scheme != "https"
            or not hostname
            or parsed_url.username
            or parsed_url.password
            or parsed_url.query
            or parsed_url.fragment
        ):
            raise ValueError("Telegram webhook must use public HTTPS when enabled")
        if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(
            (".localhost", ".local", ".localdomain", ".internal", ".lan", ".intranet")
        ):
            raise ValueError("Telegram webhook must use public HTTPS when enabled")
        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            ascii_hostname: str = hostname.encode("idna").decode("ascii")
            hostname_labels: list[str] = ascii_hostname.split(".")
            valid_hostname: bool = (
                len(ascii_hostname) <= 253
                and len(hostname_labels) > 1
                and all(
                    re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                    for label in hostname_labels
                )
            )
            if not valid_hostname:
                raise ValueError("Telegram webhook must use public HTTPS when enabled")
            return value
        if not address.is_global:
            raise ValueError("Telegram webhook must use public HTTPS when enabled")
        return value

    BACKEND_CORS_ORIGINS: Annotated[
        List[str],
        BeforeValidator(parse_cors_origins)
    ] = []


settings = Settings()
