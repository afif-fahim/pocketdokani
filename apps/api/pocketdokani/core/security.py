import hashlib
import secrets
from datetime import timedelta, timezone
from typing import Literal

from fastapi import HTTPException, Request, Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from pocketdokani.core.config import settings
from pocketdokani.data.db import now
from pocketdokani.data.records import BrowserSession, RequestBudget

Context = Literal["seller", "judge"]


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def require_mutation(request: Request) -> None:
    if request.headers.get("x-pocketdokani-request") != "1":
        raise HTTPException(403, "Use the PocketDokani application to make changes.")
    origin = request.headers.get("origin")
    if origin and origin != settings().web_origin:
        raise HTTPException(403, "This origin is not allowed.")


def budget(db: Session, key: str, maximum: int, minutes: int = 60) -> None:
    # A transaction-scoped lock also serialises the first INSERT on PostgreSQL.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        lock = int.from_bytes(
            hashlib.sha256(key.encode()).digest()[:8], "big", signed=True
        )
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock})
    record = db.get(RequestBudget, key, with_for_update=True)
    timestamp = now()
    if record is None:
        record = RequestBudget(
            key=key, used=0, resets_at=timestamp + timedelta(minutes=minutes)
        )
        db.add(record)
    elif record.resets_at.replace(tzinfo=timezone.utc) <= timestamp:
        record.used = 0
        record.resets_at = timestamp + timedelta(minutes=minutes)
    if record.used >= maximum:
        raise HTTPException(
            429,
            "Too many attempts. Please try again later.",
            headers={"Retry-After": str(minutes * 60)},
        )
    record.used += 1
    db.commit()


def issue_session(db: Session, response: Response, context: Context) -> BrowserSession:
    token = secrets.token_urlsafe(32)
    owner = "shop" if context == "seller" else secrets.token_hex(24)
    session = BrowserSession(
        token_hash=digest(token),
        context=context,
        owner=owner,
        expires_at=now() + timedelta(hours=settings().session_hours),
    )
    db.add(session)
    response.set_cookie(
        f"pd_{context}",
        token,
        httponly=True,
        secure=settings().environment == "production",
        samesite="strict",
        max_age=settings().session_hours * 3600,
        path="/",
    )
    return session


def authenticate(
    db: Session, request: Request, context: Context, lock: bool = False
) -> BrowserSession:
    token = request.cookies.get(f"pd_{context}", "")
    statement = select(BrowserSession).where(
        BrowserSession.token_hash == digest(token),
        BrowserSession.context == context,
        BrowserSession.expires_at > now(),
    )
    if lock:
        statement = statement.with_for_update()
    session = db.scalar(statement)
    if session is None:
        raise HTTPException(401, "Sign in again to open this workspace.")
    return session
