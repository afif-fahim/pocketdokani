"""Courier boundary: one create attempt, followed by invoice reconciliation."""

import hashlib
import json
from dataclasses import dataclass
from typing import Literal, Protocol
from urllib.parse import quote

import httpx
from sqlalchemy import JSON, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from pocketdokani.core.config import settings
from pocketdokani.data.db import Base

BASE_URL = "https://portal.packzy.com/api/v1"
MAX_RESPONSE_BYTES = 1024 * 1024
ResultKind = Literal["booked", "not_found", "duplicate", "rejected", "unknown"]
FakeScenario = Literal["success", "duplicate", "timeout", "late_success"]


@dataclass(frozen=True)
class CourierResult:
    kind: ResultKind
    raw: dict[str, object]
    consignment_id: str | None = None
    tracking_code: str | None = None
    message: str = ""


class Courier(Protocol):
    def create(self, payload: dict[str, object]) -> CourierResult: ...

    def lookup(self, invoice: str) -> CourierResult: ...


def _identifier(value: object) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return str(value)
    if isinstance(value, str) and value.isascii() and value.isdigit():
        return value if 0 < len(value) <= 100 and int(value) > 0 else None
    return None


def _tracking_code(value: object) -> str | None:
    return value if isinstance(value, str) and 0 < len(value) <= 100 else None


def _duplicate(body: dict[str, object]) -> bool:
    # The single-order API reports validation failures in errors; older API
    # versions use a message. Do not turn every invalid invoice into a duplicate.
    text = json.dumps(body, ensure_ascii=False).lower()
    return "invoice" in text and any(
        marker in text
        for marker in (
            "already exists",
            "already been",
            "already_exists",
            "taken",
            "unique",
        )
    )


class SteadfastLive:
    """Never retry POST, follow redirects, or include provider errors in exceptions."""

    def __init__(self) -> None:
        config = settings()
        self._api_key = config.steadfast_api_key.get_secret_value()
        self._secret_key = config.steadfast_secret_key.get_secret_value()

    def _redact(self, value: object) -> object:
        if isinstance(value, str):
            for secret in (self._api_key, self._secret_key):
                if secret:
                    value = value.replace(secret, "[redacted]")
            return value
        if isinstance(value, list):
            return [self._redact(item) for item in value]
        if isinstance(value, dict):
            return {
                str(self._redact(key)): self._redact(item)
                for key, item in value.items()
            }
        return value

    def _request(
        self, method: str, path: str, payload: dict[str, object] | None = None
    ) -> tuple[int | None, dict[str, object]]:
        try:
            with httpx.Client(
                timeout=httpx.Timeout(30, connect=10), follow_redirects=False
            ) as client:
                with client.stream(
                    method,
                    BASE_URL + path,
                    headers={
                        "Api-Key": self._api_key,
                        "Secret-Key": self._secret_key,
                        "Accept": "application/json",
                    },
                    json=payload,
                ) as response:
                    chunks = bytearray()
                    for chunk in response.iter_bytes():
                        chunks.extend(chunk)
                        if len(chunks) > MAX_RESPONSE_BYTES:
                            return None, {"error": "response_too_large"}
                    body = json.loads(chunks)
                    if not isinstance(body, dict):
                        return None, {"error": "invalid_response"}
                    # Raw responses stay private, and even those must not retain
                    # a credential if a provider or proxy echoes one back.
                    safe = self._redact(body)
                    assert isinstance(safe, dict)
                    return response.status_code, safe
        except (httpx.HTTPError, ValueError, RecursionError):
            return None, {"error": "request_failed"}

    def create(self, payload: dict[str, object]) -> CourierResult:
        status, body = self._request("POST", "/create_order", payload)
        if status is None or status >= 500 or status == 429:
            return CourierResult("unknown", body, message="Booking outcome is unknown.")
        if status == 200 and body.get("status") in (200, "200"):
            consignment = body.get("consignment")
            if isinstance(consignment, dict):
                consignment_id = _identifier(consignment.get("consignment_id"))
                tracking_code = _tracking_code(consignment.get("tracking_code"))
                if (
                    consignment.get("invoice") == payload.get("invoice")
                    and consignment_id
                    and tracking_code
                ):
                    return CourierResult("booked", body, consignment_id, tracking_code)
            return CourierResult(
                "unknown", body, message="Booking response is incomplete."
            )
        if _duplicate(body):
            return CourierResult("duplicate", body, message="Invoice already exists.")
        body_status = body.get("status")
        auth_rejection = status in (401, 403) and (
            isinstance(body.get("message"), str)
            or body_status in (401, "401", 403, "403")
        )
        field_rejection = (
            status in (200, 400, 422)
            and body_status in (400, "400", 422, "422")
            and isinstance(body.get("errors"), dict)
            and bool(body["errors"])
        )
        if "consignment" not in body and (auth_rejection or field_rejection):
            return CourierResult(
                "rejected",
                body,
                message="Courier rejected the request. Review the order and server configuration.",
            )
        return CourierResult("unknown", body, message="Booking outcome is unknown.")

    def lookup(self, invoice: str) -> CourierResult:
        path_invoice = quote(invoice, safe="")
        status, status_body = self._request("GET", "/status_by_invoice/" + path_invoice)
        raw: dict[str, object] = {"status_by_invoice": status_body}
        if (
            status != 200
            or status_body.get("status") not in (200, "200")
            or not isinstance(status_body.get("delivery_status"), str)
            or status_body.get("delivery_status") == "unknown"
            or ("invoice" in status_body and status_body["invoice"] != invoice)
        ):
            # The guide specifies no definitive not-found response. In
            # particular, an unauthorized parcel and bad credentials both use
            # 401. Neither is evidence that a previous POST did not book it.
            return CourierResult(
                "unknown", raw, message="Invoice lookup is inconclusive."
            )
        status, history = self._request("GET", "/trackings_by_invoice/" + path_invoice)
        raw["trackings_by_invoice"] = history
        rows = history.get("tracking")
        if (
            status != 200
            or history.get("status") not in (200, "200")
            or not isinstance(rows, list)
            or not rows
            or ("invoice" in history and history["invoice"] != invoice)
        ):
            return CourierResult(
                "unknown", raw, message="Consignment lookup is incomplete."
            )
        ids: set[str] = set()
        for row in rows:
            if not isinstance(row, dict):
                return CourierResult("unknown", raw)
            consignment_id = _identifier(row.get("consignment_id"))
            if consignment_id is None or (
                "invoice" in row and row["invoice"] != invoice
            ):
                return CourierResult("unknown", raw)
            ids.add(consignment_id)
        if len(ids) != 1:
            return CourierResult(
                "unknown", raw, message="Invoice identifies multiple consignments."
            )
        # The documented history endpoint recovers the ID, but not the tracking
        # code. Keep that absence explicit instead of inventing a code.
        return CourierResult(
            "booked",
            raw,
            next(iter(ids)),
            message="Existing consignment recovered. Tracking code is available in the merchant panel.",
        )


class FakeConsignment(Base):
    """Durable external-provider stand-in, isolated by constructed shop owner."""

    __tablename__ = "fake_consignments"

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    invoice: Mapped[str] = mapped_column(String(100), primary_key=True)
    consignment_id: Mapped[str] = mapped_column(String(100), unique=True)
    tracking_code: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict[str, object]] = mapped_column(JSON)


class SteadfastFake:
    def __init__(
        self, db: Session, owner: str, scenario: FakeScenario = "success"
    ) -> None:
        self._bind = db.get_bind()
        self._owner = owner
        self._scenario = scenario

    @staticmethod
    def _result(row: FakeConsignment) -> CourierResult:
        return CourierResult(
            "booked",
            {
                "status": 200,
                "fake": True,
                "consignment": {
                    "invoice": row.invoice,
                    "consignment_id": row.consignment_id,
                    "tracking_code": row.tracking_code,
                },
            },
            row.consignment_id,
            row.tracking_code,
        )

    def create(self, payload: dict[str, object]) -> CourierResult:
        invoice = payload.get("invoice")
        if not isinstance(invoice, str) or not invoice:
            return CourierResult(
                "rejected", {"fake": True}, message="Invoice is required."
            )
        with Session(self._bind, expire_on_commit=False) as provider:
            row = provider.get(FakeConsignment, (self._owner, invoice))
            if row:
                return CourierResult(
                    "duplicate", {"fake": True, "error": "invoice already exists"}
                )
            if self._scenario == "timeout":
                return CourierResult(
                    "unknown", {"fake": True, "error": "simulated_timeout"}
                )
            fingerprint = (
                hashlib.sha256((self._owner + "/" + invoice).encode())
                .hexdigest()
                .upper()
            )
            row = FakeConsignment(
                owner=self._owner,
                invoice=invoice,
                consignment_id="FAKE-" + fingerprint[:24],
                tracking_code="FAKE-" + fingerprint[24:36],
                payload=payload,
            )
            provider.add(row)
            try:
                provider.commit()
            except IntegrityError:
                provider.rollback()
                # A second request reached the provider concurrently; its invoice
                # won the unique constraint and must be reconciled, not retried.
                return CourierResult(
                    "duplicate", {"fake": True, "error": "invoice already exists"}
                )
            if self._scenario == "duplicate":
                return CourierResult(
                    "duplicate", {"fake": True, "error": "invoice already exists"}
                )
            if self._scenario == "late_success":
                return CourierResult(
                    "unknown", {"fake": True, "error": "simulated_timeout"}
                )
            return self._result(row)

    def lookup(self, invoice: str) -> CourierResult:
        with Session(self._bind) as provider:
            row = provider.get(FakeConsignment, (self._owner, invoice))
            return (
                self._result(row)
                if row
                else CourierResult("not_found", {"fake": True, "status": "not_found"})
            )
