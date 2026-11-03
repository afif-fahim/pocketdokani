"""Seller-authorized actions shared by Orders and assistant proposal cards."""

from datetime import datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from pocketdokani.data.db import now
from pocketdokani.data.records import (
    BrowserSession,
    Order,
    OrderDraft,
    OrderLine,
    Sku,
    Workspace,
    identifier,
)
from pocketdokani.features.courier.bookings import require_no_pending_booking
from pocketdokani.features.orders.drafting import DraftValues
from pocketdokani.features.orders.order_locking import bump_order_draft_revision

STATUS_TRANSITIONS = {
    "draft": ("cancelled",),
    "confirmed": ("cancelled",),
    "packed": ("cancelled",),
    "booked": ("delivered", "returned", "cancelled"),
}


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["delivered", "returned", "cancelled"]
    expected_status: str = Field(max_length=16)
    expected_updated_at: datetime


class NewDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # A client-generated ID makes retrying draft creation safe.
    request_id: str = Field(pattern=r"^[a-f0-9-]{36}$")
    values: DraftValues


def create_draft(db: Session, actor: BrowserSession, payload: NewDraft) -> Workspace:
    workspace = db.get(Workspace, payload.request_id)
    if workspace:
        if workspace.owner != actor.owner or workspace.context != actor.context:
            raise HTTPException(404, "Draft not found in this session.")
        return workspace
    workspace = Workspace(
        id=payload.request_id,
        reference="PD-" + identifier().replace("-", "")[:16].upper(),
        owner=actor.owner,
        context=actor.context,
        layout="seller-draft-v1",
        seller_side="right",
        confirmed_by=actor.owner,
    )

    def field(value: str | None) -> dict[str, object]:
        return {
            "value": value,
            "quote": "",
            "screenshot_index": None,
            "voice_note_id": None,
            "issue": "Review before confirming the order.",
            "edited": True,
        }

    values = payload.values.model_dump(exclude={"order_confirmed"})
    content: dict[str, object] = {
        key: field(value) for key, value in values.items() if key != "lines"
    }
    content["order_confirmed"] = field(None)
    content["lines"] = [
        {key: field(value) for key, value in line.items() if key != "source_line"}
        for line in values["lines"]
    ]
    db.add(workspace)
    db.flush()
    db.add(OrderDraft(workspace_id=workspace.id, owner=actor.owner, content=content))
    db.commit()
    return workspace


def change_status(
    db: Session, actor: BrowserSession, order_id: str, payload: StatusChange
) -> None:
    order = db.get(Order, (actor.owner, order_id))
    if order is None:
        raise HTTPException(404, "Order not found in this shop.")
    if payload.status not in STATUS_TRANSITIONS.get(payload.expected_status, ()):
        raise HTTPException(409, "That status transition is not available.")
    # Draft writes claim this revision before changing Order. Use the same lock
    # order so a concurrent edit/confirmation cannot revive a cancelled order.
    bump_order_draft_revision(db, actor.owner, order_id, now())
    require_no_pending_booking(db, actor.owner, order_id)
    changed = db.scalar(
        update(Order)
        .where(
            Order.owner == actor.owner,
            Order.id == order_id,
            Order.status == payload.expected_status,
            Order.updated_at == payload.expected_updated_at,
        )
        .values(status=payload.status, active_pack_check_id=None, updated_at=now())
        .returning(Order.id)
    )
    if changed is None:
        raise HTTPException(409, "This order changed. Reload and review it again.")
    if payload.expected_status == "booked" and payload.status in (
        "returned",
        "cancelled",
    ):
        # Booked stock was already deducted. Return each line exactly once.
        lines = db.scalars(
            select(OrderLine)
            .where(OrderLine.owner == actor.owner, OrderLine.order_id == order_id)
            .order_by(OrderLine.sku)
        ).all()
        for line in lines:
            db.execute(
                update(Sku)
                .where(Sku.owner == actor.owner, Sku.sku == line.sku)
                .values(stock_qty=Sku.stock_qty + line.quantity)
            )
    db.commit()
