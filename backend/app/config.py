"""Application configuration and logging setup.

All runtime configuration is read from environment variables. We load a local
``.env`` file (when present) using python-dotenv, then validate and type the
values with a Pydantic v2 settings model so the rest of the app never touches
raw ``os.environ`` directly.
"""

from __future__ import annotations

import logging
import sys
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env into the process environment before Settings reads it.
# Explicitly requested: python-dotenv. pydantic-settings then validates.
load_dotenv()


class Settings(BaseSettings):
    """Strongly-typed application settings.

    Environment variables (all optional, sensible defaults provided):
        APP_NAME, APP_ENV, LOG_LEVEL
        QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL, QWEN_TIMEOUT_SECONDS
        CORS_ORIGINS  (comma-separated list)
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- General ---------------------------------------------------------
    app_name: str = Field(default="ForgeOS Backend")
    app_env: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # --- LLM (Qwen, OpenAI-compatible) -----------------------------------
    # No key yet -> the QwenClient runs disabled and agents use deterministic
    # planning. Drop a real key here to go live with zero code changes.
    qwen_api_key: str | None = Field(default=None)
    qwen_base_url: str = Field(
        default="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        description="OpenAI-compatible base URL for the Qwen-serving endpoint.",
    )
    qwen_model: str = Field(default="qwen-plus")
    qwen_timeout_seconds: float = Field(default=30.0)

    # --- Demo protection ---------------------------------------------------
    # Per-client requests per minute for LLM-consuming endpoints. Set to 0 to
    # disable the limiter entirely (not recommended for public deployments).
    rate_limit_per_minute: int = Field(default=5)
    # Hard cap on orchestration requests across ALL clients per hour. Bounds
    # worst-case API spend even under distributed abuse.
    rate_limit_global_per_hour: int = Field(default=100)
    # Set true ONLY when running behind a trusted reverse proxy, so the rate
    # limiter keys on X-Forwarded-For instead of the proxy's own address.
    trust_proxy: bool = Field(default=False)

    # --- HTTP ------------------------------------------------------------
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        description="Comma-separated list of allowed CORS origins.",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS origins into a clean list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_enabled(self) -> bool:
        """True only when an API key is actually configured."""
        return bool(self.qwen_api_key and self.qwen_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()


def configure_logging(level: str | None = None) -> None:
    """Configure root logging once, writing structured-ish lines to stdout."""
    resolved = (level or get_settings().log_level).upper()
    logging.basicConfig(
        level=getattr(logging, resolved, logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    # Quiet noisy third-party loggers.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger (configuration assumed already done at startup)."""
    return logging.getLogger(name)
