from typing import List, Union
from pydantic import AnyHttpUrl, BeforeValidator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Annotated


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


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    ENVIRONMENT: str = "development"
    TESTING: bool = False
    API_V1_STR: str = "/api/v1"

    JWT_SECRET_KEY: str
    JWT_REFRESH_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    POSTGRES_SERVER: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"

    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SMTP_FROM_EMAIL: str

    TIMEZONE: str = "Asia/Dushanbe"
    STORAGE_PATH: str = "storage"
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_BOT_SECRET_TOKEN: str
    TELEGRAM_WEBHOOK_URL: str = "http://localhost:8000/api/v1/telegram/webhook"

    BACKEND_CORS_ORIGINS: Annotated[
        List[str],
        BeforeValidator(parse_cors_origins)
    ] = []


settings = Settings()
