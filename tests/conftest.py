"""Load isolated configuration before test collection imports the application."""

import pytest
from pocketdokani.core import config
from pydantic import SecretStr

# The database engine is created during import, before fixtures can run. Provide
# explicit settings here so collection also ignores local .env and credentials.
_settings = config.Settings(
    _env_file=None,
    environment="development",
    database_url=SecretStr("sqlite://"),
    shop_passcode=SecretStr("constructed-booking-check-only"),
    web_origin="http://localhost:3000",
    storage_backend="local",
    supabase_url="",
    supabase_service_role_key=SecretStr(""),
    model_calls_enabled=False,
    model_api_key=SecretStr(""),
    steadfast_live_enabled=False,
    steadfast_api_key=SecretStr(""),
    steadfast_secret_key=SecretStr(""),
)
_patch = pytest.MonkeyPatch()
_patch.setattr(config, "settings", lambda: _settings)


def pytest_unconfigure() -> None:
    _patch.undo()
