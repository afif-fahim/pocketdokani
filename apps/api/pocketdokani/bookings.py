"""Seller-confirmed courier booking with durable claims and invoice recovery."""

import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from pocketdokani.config import settings
from pocketdokani.courier import (
    Courier,
    CourierResult,
    FakeScenario,
    SteadfastFake,
    SteadfastLive,
)
from pocketdokani.db import now
from pocketdokani.order_locking import bump_order_draft_revision
from pocketdokani.records import (
    BrowserSession,
    CourierBooking,
    Order,
    OrderLine,
    PackCheck,
    Sku,
    identifier,
)
from pocketdokani.stock import available_quantity

HELD_STATES = ("in_progress", "booking_unknown", "not_found")


class BookOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: datetime
    fake_scenario: FakeScenario | None = None


def courier_mode(actor: BrowserSession) -> Literal["fake", "live", "disabled"]:
    if actor.context == "judge":
        return "fake"
    config = settings()
    if config.steadfast_live_enabled:
        return "live"
    return "fake" if config.environment == "development" else "disabled"


def booking_payload(
    db: Session, actor: BrowserSession, order: Order
) -> dict[str, object] | None:
    booking = db.get(CourierBooking, (actor.owner, order.id))
    if booking is None:
        return None
    return {
        "state": booking.state,
        "mode": booking.mode,
        "message": booking.message,
        "can_retry": booking.state in ("not_found", "rejected"),
    }


def stock_holds(db: Session, owner: str) -> Counter[str]:
    holds: Counter[str] = Counter()
    for quantities in db.scalars(
        select(CourierBooking.quantities).where(
            CourierBooking.owner == owner, CourierBooking.state.in_(HELD_STATES)
        )
    ):
        holds.update(quantities)
    return holds


def require_no_pending_booking(db: Session, owner: str, order_id: str) -> None:
    booking = db.get(CourierBooking, (owner, order_id), populate_existing=True)
    if booking and booking.state in HELD_STATES:
        raise HTTPException(
            409, "Resolve the courier booking before changing this order."
        )


def _lock_order(db: Session, actor: BrowserSession, order_id: str) -> Order:
    # Use the same lock order as draft, packing and status writes.
    bump_order_draft_revision(db, actor.owner, order_id, now())
    db.execute(
        update(Order)
        .where(Order.owner == actor.owner, Order.id == order_id)
        .values(updated_at=Order.updated_at)
    )
    order = db.scalar(
        select(Order)
        .where(Order.owner == actor.owner, Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise HTTPException(404, "Order not found in this shop.")
    return order


def _provider(
    db: Session, owner: str, mode: str, scenario: FakeScenario = "success"
) -> Courier:
    if mode == "live":
        config = settings()
        if not config.steadfast_live_enabled:
            raise HTTPException(409, "Live courier calls are disabled on this server.")
        return SteadfastLive()
    return SteadfastFake(db, owner, scenario)


def _snapshot(
    db: Session, actor: BrowserSession, order: Order, mode: str
) -> tuple[dict[str, object], dict[str, int]]:
    check = (
        db.get(PackCheck, order.active_pack_check_id)
        if order.active_pack_check_id
        else None
    )
    if (
        order.status != "packed"
        or check is None
        or check.owner != actor.owner
        or check.order_id != order.id
        or not (
            check.verdict == "pass" or (check.verdict == "unsure" and check.override_by)
        )
    ):
        raise HTTPException(
            409,
            "Only an order with a current packing pass or seller override can be booked.",
        )
    lines = db.execute(
        select(OrderLine, Sku)
        .join(Sku, (Sku.owner == OrderLine.owner) & (Sku.sku == OrderLine.sku))
        .where(OrderLine.owner == actor.owner, OrderLine.order_id == order.id)
        .order_by(OrderLine.line_number)
    ).all()
    quantities: Counter[str] = Counter()
    descriptions: list[str] = []
    for line, sku in lines:
        quantities[sku.sku] += line.quantity
        descriptions.append(f"{line.quantity} x {sku.product_name} ({sku.variant})")
    if not quantities:
        raise HTTPException(422, "The order needs at least one item.")
    payload: dict[str, object] = {
        "invoice": order.reference,
        "recipient_name": order.customer_name or "",
        "recipient_phone": order.phone or "",
        "recipient_address": order.address or "",
        "cod_amount": float(order.cod_amount),
        # The courier accepts a short description, not an invoice line table.
        "item_description": "; ".join(descriptions)[:255],
        # Internal/source notes are never sent to the courier as instructions.
        "note": "",
    }
    if mode == "live":
        limits = {
            "invoice": 100,
            "recipient_name": 100,
            "recipient_address": 490,
            "item_description": 255,
        }
        if any(
            not str(payload[key]).strip() or len(str(payload[key])) > limit
            for key, limit in limits.items()
        ):
            raise HTTPException(
                422,
                "Review recipient details and item description lengths before booking.",
            )
        if not re.fullmatch(r"01[3-9][0-9]{8}", str(payload["recipient_phone"])):
            raise HTTPException(
                422, "A valid Bangladesh mobile number is required for live booking."
            )
        if not Decimal(0) <= order.cod_amount <= Decimal("1000000"):
            raise HTTPException(
                422, "Steadfast COD must be between 0 and 1,000,000 BDT."
            )
        if not re.fullmatch(r"[A-Za-z0-9_-]+", order.reference):
            raise HTTPException(
                422, "The order reference is not a supported courier invoice."
            )
    return payload, dict(quantities)


def _reserve(db: Session, owner: str, quantities: dict[str, int]) -> None:
    # Serialize bookings sharing a SKU before reading committed holds. Stock is
    # physically deducted only after a consignment is known to exist.
    for sku, quantity in sorted(quantities.items()):
        row = db.scalar(
            update(Sku)
            .where(Sku.owner == owner, Sku.sku == sku, Sku.lot_received.is_(True))
            .values(stock_qty=Sku.stock_qty)
            .returning(Sku.stock_qty)
        )
        if (
            row is None
            or available_quantity(
                row, lot_received=True, held_qty=stock_holds(db, owner)[sku]
            )
            < quantity
        ):
            raise HTTPException(
                409, "There is not enough available received stock to book this order."
            )


def _finish(
    db: Session,
    actor: BrowserSession,
    order_id: str,
    attempt: str,
    result: CourierResult,
    operation: str,
) -> dict[str, object]:
    order = _lock_order(db, actor, order_id)
    booking = db.get(CourierBooking, (actor.owner, order_id), populate_existing=True)
    if booking is None:
        raise HTTPException(409, "The booking changed. Reload the order.")
    if booking.state == "booked" or booking.attempt_id != attempt:
        db.commit()
        return booking_payload(db, actor, order) or {}
    booking.responses = [
        *booking.responses[-19:],
        {"operation": operation, "result": result.kind, "response": result.raw},
    ]
    booking.updated_at = now()
    if result.kind == "booked" and result.consignment_id:
        if order.status != "packed":
            raise HTTPException(
                409,
                "The order changed during courier booking. Reconcile before proceeding.",
            )
        for sku, quantity in sorted(booking.quantities.items()):
            changed = db.scalar(
                update(Sku)
                .where(
                    Sku.owner == actor.owner, Sku.sku == sku, Sku.stock_qty >= quantity
                )
                .values(stock_qty=Sku.stock_qty - quantity)
                .returning(Sku.sku)
            )
            if changed is None:
                raise HTTPException(
                    409, "Stock changed. The booking is held for reconciliation."
                )
        order.status = "booked"
        order.consignment_id = result.consignment_id
        order.tracking_code = result.tracking_code
        order.updated_at = now()
        booking.state = "booked"
        booking.message = result.message or (
            "Fake consignment created."
            if booking.mode == "fake"
            else "Steadfast consignment created."
        )
    elif result.kind == "not_found":
        booking.state = "not_found"
        booking.message = "Invoice was not found. You may retry the same booking."
    elif result.kind == "rejected" and operation == "create":
        booking.state = "rejected"
        booking.message = (
            result.message or "Courier rejected the request. Review it before retrying."
        )
    else:
        booking.state = "booking_unknown"
        booking.message = (
            "Booking outcome is unknown. Check the invoice before any retry."
        )
    db.commit()
    return booking_payload(db, actor, order) or {}


def book_order(
    db: Session, actor: BrowserSession, order_id: str, request: BookOrder
) -> dict[str, object]:
    order = _lock_order(db, actor, order_id)
    booking = db.get(CourierBooking, (actor.owner, order_id), populate_existing=True)
    if booking and booking.state not in ("not_found", "rejected"):
        db.commit()
        return booking_payload(db, actor, order) or {}
    mode = (
        booking.mode
        if booking and booking.state == "not_found"
        else courier_mode(actor)
    )
    if actor.context == "judge" and mode != "fake":
        raise HTTPException(409, "Judge sessions can use only the fake courier.")
    if mode == "disabled":
        raise HTTPException(409, "Live courier booking is disabled on this server.")
    if mode == "live" and request.fake_scenario is not None:
        raise HTTPException(
            422, "Simulation options are available only for fake bookings."
        )
    if order.updated_at.replace(
        tzinfo=timezone.utc
    ) != request.expected_updated_at.astimezone(timezone.utc):
        raise HTTPException(
            409, "This order changed. Reload and review before booking."
        )
    if booking and booking.state == "not_found":
        payload, quantities = booking.payload, booking.quantities
    else:
        payload, quantities = _snapshot(db, actor, order, mode)
        _reserve(db, actor.owner, quantities)
    provider = _provider(db, actor.owner, mode, request.fake_scenario or "success")
    attempt = identifier()
    if booking is None:
        booking = CourierBooking(
            owner=actor.owner,
            order_id=order.id,
            mode=mode,
            payload=payload,
            quantities=quantities,
            responses=[],
        )
        db.add(booking)
    else:
        booking.mode, booking.payload, booking.quantities = mode, payload, quantities
    booking.state, booking.attempt_id = "in_progress", attempt
    booking.message, booking.updated_at = "Booking request is in progress.", now()
    # Claim a new order version even for historical orders without a draft.
    order.updated_at = now()
    db.commit()
    result = provider.create(payload)
    if result.kind == "duplicate":
        # Preserve the duplicate response before the read-only recovery request.
        _finish(db, actor, order_id, attempt, result, "create")
        result = provider.lookup(str(payload["invoice"]))
        return _finish(db, actor, order_id, attempt, result, "lookup")
    return _finish(db, actor, order_id, attempt, result, "create")


def reconcile_booking(
    db: Session, actor: BrowserSession, order_id: str
) -> dict[str, object]:
    order = _lock_order(db, actor, order_id)
    booking = db.get(CourierBooking, (actor.owner, order_id), populate_existing=True)
    if booking is None:
        raise HTTPException(409, "This order has no booking to reconcile.")
    if actor.context == "judge" and booking.mode != "fake":
        raise HTTPException(409, "Judge sessions can use only the fake courier.")
    if booking.state in ("booked", "rejected", "not_found"):
        db.commit()
        return booking_payload(db, actor, order) or {}
    if booking.state == "in_progress" and now() - booking.updated_at.replace(
        tzinfo=timezone.utc
    ) < timedelta(minutes=3):
        db.commit()
        return booking_payload(db, actor, order) or {}
    provider = _provider(db, actor.owner, booking.mode)
    attempt, invoice = booking.attempt_id, str(booking.payload["invoice"])
    booking.state, booking.updated_at = "booking_unknown", now()
    db.commit()
    return _finish(db, actor, order_id, attempt, provider.lookup(invoice), "lookup")
