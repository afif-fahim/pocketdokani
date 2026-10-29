from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from pocketdokani.db import Base, now


def identifier() -> str:
    return str(uuid4())


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    __table_args__ = (CheckConstraint("context IN ('seller', 'judge')"),)

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    context: Mapped[str] = mapped_column(String(10))
    owner: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RequestBudget(Base):
    __tablename__ = "request_budgets"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)
    resets_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint("context IN ('seller', 'judge')"),
        CheckConstraint("seller_side IN ('left', 'right')"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    context: Mapped[str] = mapped_column(String(10))
    owner: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    layout: Mapped[str] = mapped_column(String(50))
    seller_side: Mapped[str] = mapped_column(String(5))
    confirmed_by: Mapped[str] = mapped_column(String(64))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SourceImage(Base):
    __tablename__ = "source_images"
    __table_args__ = (UniqueConstraint("workspace_id", "sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(160))
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(30))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)


class Sku(Base):
    __tablename__ = "skus"

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    sku: Mapped[str] = mapped_column(String(80), primary_key=True)
    product_name: Mapped[str] = mapped_column(String(160))
    variant: Mapped[str] = mapped_column(String(80))
    lot: Mapped[str] = mapped_column(String(80))
    lot_received: Mapped[bool] = mapped_column(Boolean)
    constructed: Mapped[bool] = mapped_column(Boolean)
    reviewed_by: Mapped[str] = mapped_column(String(100))
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
