from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", hide_input_in_errors=True
    )

    environment: Literal["development", "production"] = "production"
    database_url: SecretStr
    shop_passcode: SecretStr
    web_origin: str = "http://localhost:3000"
    storage_backend: Literal["local", "supabase"] = "supabase"
    local_storage_path: Path = Path("data/private/objects")
    supabase_url: str = ""
    supabase_service_role_key: SecretStr = SecretStr("")
    supabase_bucket: str = "pocketdokani-evidence"
    session_hours: int = 12
    model_api_key: SecretStr = SecretStr("")
    model_calls_enabled: bool = False
    judge_model_calls_per_hour: int = 12
    seller_model_calls_per_hour: int = 60

    @model_validator(mode="after")
    def deployment_requirements(self) -> "Settings":
        if len(self.shop_passcode.get_secret_value()) < 12:
            raise ValueError("SHOP_PASSCODE needs at least 12 characters")
        if self.storage_backend == "supabase" and (
            not self.supabase_url.startswith("https://")
            or not self.supabase_service_role_key.get_secret_value()
        ):
            raise ValueError("Configure Supabase URL and server-side service role key")
        if self.environment == "production":
            if not self.database_url.get_secret_value().startswith(
                "postgresql+psycopg://"
            ):
                raise ValueError("Production requires PostgreSQL with psycopg")
            if self.storage_backend != "supabase" or not self.web_origin.startswith(
                "https://"
            ):
                raise ValueError(
                    "Production requires HTTPS and Supabase object storage"
                )
        if self.web_origin.endswith("/"):
            raise ValueError("WEB_ORIGIN must have no trailing slash")
        return self


@lru_cache
def settings() -> Settings:
    return Settings()
