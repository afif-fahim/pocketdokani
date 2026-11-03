"""Read business records through the authenticated shop owner boundary."""

from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from pocketdokani.bookings import booking_payload, courier_mode, stock_holds
from pocketdokani.db import utc_iso
from pocketdokani.money import LinePrice
from pocketdokani.records import (
    BrowserSession,
    Order,
    OrderLine,
    PackCheck,
    Payout,
    Product,
    Sku,
)
from pocketdokani.stock import available_quantity


def stock_payload(db: Session, actor: BrowserSession) -> list[dict[str, object]]:
    holds = stock_holds(db, actor.owner)
    rows = db.execute(
        select(Sku, Product)
        .outerjoin(
            Product,
            (Product.owner == Sku.owner) & (Product.product_id == Sku.product_id),
        )
        .where(Sku.owner == actor.owner)
        .order_by(Sku.lot, Sku.sku)
    ).all()
    return [
        {
            "sku": sku.sku,
            "product_id": sku.product_id,
            "product_name": sku.product_name,
            "variant": sku.variant,
            "lot": sku.lot,
            "lot_received": sku.lot_received,
            "eligible": available_quantity(
                sku.stock_qty, lot_received=sku.lot_received, held_qty=holds[sku.sku]
            )
            > 0,
            "stock_qty": sku.stock_qty,
            "available_qty": available_quantity(
                sku.stock_qty, lot_received=sku.lot_received, held_qty=holds[sku.sku]
            ),
            "booking_held_qty": holds[sku.sku],
            "unit_cost": str(sku.unit_cost),
            "list_price": str(sku.list_price),
            "photo_url": f"/api/{actor.context}/products/{quote(sku.product_id or '', safe='')}/photo"
            if product is not None and product.photo_key
            else None,
            "constructed": sku.constructed,
            "reviewed_by": sku.reviewed_by,
            "reviewed_at": utc_iso(sku.reviewed_at),
        }
        for sku, product in rows
    ]


def orders_payload(db: Session, actor: BrowserSession) -> list[dict[str, object]]:
    orders = db.scalars(
        select(Order)
        .where(Order.owner == actor.owner)
        .order_by(Order.created_at.desc(), Order.reference)
    ).all()
    active_checks = {
        check.id: check
        for check in db.scalars(
            select(PackCheck).where(
                PackCheck.owner == actor.owner,
                PackCheck.id.in_(
                    [
                        order.active_pack_check_id
                        for order in orders
                        if order.active_pack_check_id
                    ]
                ),
            )
        )
    }
    lines = db.execute(
        select(OrderLine, Sku)
        .join(Sku, (Sku.owner == OrderLine.owner) & (Sku.sku == OrderLine.sku))
        .where(OrderLine.owner == actor.owner)
        .order_by(OrderLine.line_number)
    ).all()
    by_order: dict[str, list[dict[str, object]]] = {}
    for line, sku in lines:
        by_order.setdefault(line.order_id, []).append(
            {
                "line_number": line.line_number,
                "sku": line.sku,
                "product_name": sku.product_name,
                "variant": sku.variant,
                "quantity": line.quantity,
                "unit_price": str(line.unit_price),
                "line_discount": str(line.line_discount),
                "line_total": str(
                    LinePrice(
                        line.quantity, line.unit_price, line.line_discount
                    ).total()
                ),
                "source_quote": line.source_quote,
            }
        )
    return [
        {
            "id": order.id,
            "reference": order.reference,
            "label_reference": order.label_reference,
            "status": order.status,
            "customer_name": order.customer_name,
            "phone": order.phone,
            "address": order.address,
            "customer_delivery_charge": str(order.customer_delivery_charge),
            "verified_prior_payment": str(order.verified_prior_payment),
            "cod_amount": str(order.cod_amount),
            "consignment_id": order.consignment_id,
            "tracking_code": order.tracking_code,
            "courier_mode": courier_mode(actor),
            "booking": booking_payload(db, actor, order),
            "source_workspace_id": order.source_workspace_id,
            "note": order.note,
            "created_at": utc_iso(order.created_at),
            "updated_at": utc_iso(order.updated_at),
            "pack_check": {
                "id": check.id,
                "verdict": check.verdict,
                "label_verdict": check.label_verdict,
                "bag_verdict": check.bag_verdict,
                "override_by": check.override_by,
                "override_at": utc_iso(check.override_at)
                if check.override_at
                else None,
            }
            if (check := active_checks.get(order.active_pack_check_id or ""))
            else None,
            "lines": by_order.get(order.id, []),
        }
        for order in orders
    ]


def payouts_payload(db: Session, actor: BrowserSession) -> list[dict[str, object]]:
    payouts = db.scalars(
        select(Payout)
        .where(Payout.owner == actor.owner)
        .order_by(Payout.paid_at.desc())
    ).all()
    orders = db.scalars(
        select(Order).where(
            Order.owner == actor.owner, Order.payout_source_id.is_not(None)
        )
    ).all()
    return [
        {
            "statement": payout.source_id,
            "paid_at": utc_iso(payout.paid_at),
            "amount": str(payout.amount),
            "note": payout.note,
            "order_references": [
                order.reference
                for order in orders
                if order.payout_source_id == payout.source_id
            ],
        }
        for payout in payouts
    ]
