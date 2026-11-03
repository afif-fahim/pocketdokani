from datetime import datetime
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from pocketdokani.db import Base, now


def identifier() -> str:
    return str(uuid4())


def historical_order_id(owner: str, source_id: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"pocketdokani/{owner}/historical/{source_id}"))


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
    __table_args__ = (
        ForeignKeyConstraint(
            ["owner", "product_id"], ["products.owner", "products.product_id"]
        ),
        CheckConstraint("unit_cost >= 0 AND list_price >= 0 AND stock_qty >= 0"),
    )

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    sku: Mapped[str] = mapped_column(String(80), primary_key=True)
    product_name: Mapped[str] = mapped_column(String(160))
    variant: Mapped[str] = mapped_column(String(80))
    lot: Mapped[str] = mapped_column(String(80))
    lot_received: Mapped[bool] = mapped_column(Boolean)
    constructed: Mapped[bool] = mapped_column(Boolean)
    reviewed_by: Mapped[str] = mapped_column(String(100))
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    product_id: Mapped[str | None] = mapped_column(String(80))
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    list_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal(0), server_default="0"
    )
    stock_qty: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Product(Base):
    __tablename__ = "products"

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    photo_key: Mapped[str | None] = mapped_column(String(200))
    photo_media_type: Mapped[str | None] = mapped_column(String(30))


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("owner", "reference"),
        UniqueConstraint("owner", "source_id"),
        CheckConstraint(
            "status IN ('draft', 'confirmed', 'packed', 'booked', 'delivered', 'returned', 'cancelled')"
        ),
        CheckConstraint(
            "customer_delivery_charge >= 0 AND verified_prior_payment >= 0 AND cod_amount >= 0"
        ),
    )

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    reference: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(16))
    customer_name: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(Text)
    customer_delivery_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    verified_prior_payment: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    cod_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    consignment_id: Mapped[str | None] = mapped_column(String(100))
    tracking_code: Mapped[str | None] = mapped_column(String(100))
    active_pack_check_id: Mapped[str | None] = mapped_column(String(36))
    source_workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL")
    )
    payout_source_id: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    @property
    def label_reference(self) -> str:
        """Retain a seller's imported order number on historical parcel labels."""
        return (
            self.source_id
            if self.owner == "shop" and self.source_id
            else self.reference
        )


class OrderLine(Base):
    __tablename__ = "order_lines"
    __table_args__ = (
        ForeignKeyConstraint(["owner", "order_id"], ["orders.owner", "orders.id"]),
        ForeignKeyConstraint(["owner", "sku"], ["skus.owner", "skus.sku"]),
        CheckConstraint("quantity > 0 AND unit_price >= 0 AND line_discount >= 0"),
        CheckConstraint("line_discount <= quantity * unit_price"),
    )

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    line_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(80))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    line_discount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    source_quote: Mapped[str | None] = mapped_column(Text)


class Payout(Base):
    __tablename__ = "payouts"
    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str] = mapped_column(Text)
    __table_args__ = (CheckConstraint("amount >= 0"),)


class BusinessImport(Base):
    __tablename__ = "business_imports"
    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reviewed_by: Mapped[str] = mapped_column(String(100))


class OrderDraft(Base):
    __tablename__ = "order_drafts"
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    owner: Mapped[str] = mapped_column(String(64), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[dict[str, object]] = mapped_column(JSON)
    verified_prior_payment: Mapped[str] = mapped_column(String(30), default="0")
    payment_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    order_id: Mapped[str | None] = mapped_column(String(36))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class VoiceNote(Base):
    __tablename__ = "voice_notes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    transcript: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(80))
    input_refs: Mapped[dict[str, object]] = mapped_column(JSON)
    output: Mapped[dict[str, object]] = mapped_column(JSON)
    tokens: Mapped[dict[str, object]] = mapped_column(JSON)
    latency_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PackCheck(Base):
    __tablename__ = "pack_checks"
    __table_args__ = (
        ForeignKeyConstraint(
            ["owner", "order_id"], ["orders.owner", "orders.id"], ondelete="CASCADE"
        ),
        CheckConstraint("verdict IN ('pass', 'fail', 'unsure')"),
        CheckConstraint("label_verdict IN ('pass', 'fail', 'unsure')"),
        CheckConstraint("bag_verdict IN ('match', 'mismatch', 'unsure')"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    order_id: Mapped[str] = mapped_column(String(36), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    order_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    photo_key: Mapped[str] = mapped_column(String(200), unique=True)
    photo_media_type: Mapped[str] = mapped_column(String(30))
    photo_sha256: Mapped[str] = mapped_column(String(64))
    crop_keys: Mapped[dict[str, str | None]] = mapped_column(JSON)
    sam_path: Mapped[dict[str, object]] = mapped_column(JSON)
    reading: Mapped[dict[str, object]] = mapped_column(JSON)
    reasons: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    bag_results: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    verdict: Mapped[str] = mapped_column(String(10))
    label_verdict: Mapped[str] = mapped_column(String(10))
    bag_verdict: Mapped[str] = mapped_column(String(10))
    override_by: Mapped[str | None] = mapped_column(String(64))
    override_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CourierBooking(Base):
    __tablename__ = "courier_bookings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["owner", "order_id"], ["orders.owner", "orders.id"], ondelete="CASCADE"
        ),
        CheckConstraint("mode IN ('fake', 'live')"),
        CheckConstraint(
            "state IN ('in_progress', 'booking_unknown', 'not_found', 'rejected', 'booked')"
        ),
    )

    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mode: Mapped[str] = mapped_column(String(8))
    state: Mapped[str] = mapped_column(String(20))
    attempt_id: Mapped[str] = mapped_column(String(36))
    payload: Mapped[dict[str, object]] = mapped_column(JSON)
    quantities: Mapped[dict[str, int]] = mapped_column(JSON)
    responses: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    message: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
