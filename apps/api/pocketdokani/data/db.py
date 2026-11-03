from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session

from pocketdokani.core.config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(value: datetime) -> str:
    # SQLite's development-only driver drops timezone metadata on round trips.
    return (
        value.replace(tzinfo=timezone.utc).isoformat()
        if value.tzinfo is None
        else value.astimezone(timezone.utc).isoformat()
    )


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings().database_url.get_secret_value(),
    pool_pre_ping=True,
    hide_parameters=True,
)


def database() -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as db:
        yield db
