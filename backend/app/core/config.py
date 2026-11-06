"""Application settings loaded from environment variables (never hard-coded secrets)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",  # backend/.env (docker compose passes variables explicitly)
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "WO — Water Optimization"
    environment: str = Field(default="development", description="development | test | production")
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://wo:wo_dev_password@localhost:5432/wo"

    jwt_secret: str = Field(default="", description="HS256 signing secret, min 32 chars")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 120

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"

    open_meteo_base_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_timeout_seconds: float = 8.0
    weather_offline_mode: bool = False

    login_rate_limit_attempts: int = 10
    login_rate_limit_window_seconds: int = 300

    enable_hsts: bool = False

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, value: str) -> str:
        # Accept plain postgres URLs and route them to the psycopg (v3) driver.
        if value.startswith("postgres://"):
            value = "postgresql://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            value = "postgresql+psycopg://" + value[len("postgresql://"):]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def validate_runtime(self) -> None:
        """Fail fast on insecure configuration."""
        if len(self.jwt_secret) < 32:
            raise RuntimeError(
                "JWT_SECRET is missing or shorter than 32 characters. "
                "Run the setup script (scripts/setup.ps1 or scripts/setup.sh) or copy backend/.env.example to backend/.env and set JWT_SECRET."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
