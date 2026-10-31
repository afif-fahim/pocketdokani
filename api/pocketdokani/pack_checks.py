"""Private pack-check evidence, version claims and seller overrides."""

import base64
import hashlib
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from pocketdokani.db import now, utc_iso
from pocketdokani.demo import product_photo
from pocketdokani.imports import Original, cleanup_objects
from pocketdokani.pack_comparison import compare_label
from pocketdokani.records import (
    BrowserSession,
    Order,
    OrderDraft,
    OrderLine,
    PackCheck,
    Product,
    Sku,
)
from pocketdokani.storage import ObjectStorage


class PackOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: datetime


def owned_order(db: Session, actor: BrowserSession, order_id: str) -> Order:
    order = db.get(Order, (actor.owner, order_id), populate_existing=True)
    if order is None:
        raise HTTPException(404, "Order not found in this shop.")
    return order


def require_current(order: Order, expected: datetime) -> None:
    if order.status not in ("confirmed", "packed"):
        raise HTTPException(409, "Confirm this order before checking its parcel.")
    if utc_iso(order.updated_at) != utc_iso(expected):
        raise HTTPException(409, "This order changed. Reload and review it again.")


def sku_photos(
    db: Session, actor: BrowserSession, order_id: str
) -> list[dict[str, object]]:
    rows = db.execute(
        select(OrderLine, Sku, Product)
        .join(Sku, (Sku.owner == OrderLine.owner) & (Sku.sku == OrderLine.sku))
        .outerjoin(
            Product,
            (Product.owner == Sku.owner) & (Product.product_id == Sku.product_id),
        )
        .where(OrderLine.owner == actor.owner, OrderLine.order_id == order_id)
        .order_by(OrderLine.line_number)
    ).all()
    results: list[dict[str, object]] = []
    for line, sku, product in rows:
        image_url = None
        if product is not None and product.photo_key:
            data = (
                product_photo(product.product_id)
                if actor.context == "judge"
                else ObjectStorage().get(product.photo_key)
            )
            image_url = (
                f"data:{product.photo_media_type};base64,"
                + base64.b64encode(data).decode()
            )
        results.append(
            {
                "line_number": line.line_number,
                "sku": line.sku,
                "product_name": sku.product_name,
                "variant": sku.variant,
                "quantity": line.quantity,
                "image_url": image_url,
            }
        )
    return results


def check_payload(check: PackCheck, order: Order, context: str) -> dict[str, object]:
    base = f"/api/{context}/orders/{order.id}/pack-checks/{check.id}"
    return {
        "id": check.id,
        "order_id": check.order_id,
        "created_at": utc_iso(check.created_at),
        "order_updated_at": utc_iso(check.order_updated_at),
        "valid": order.active_pack_check_id == check.id,
        "verdict": check.verdict,
        "label_verdict": check.label_verdict,
        "bag_verdict": check.bag_verdict,
        "reasons": check.reasons,
        "bag_results": check.bag_results,
        "sam_path": check.sam_path,
        "photo_url": base + "/photo",
        "photo_sha256": check.photo_sha256,
        "crop_urls": {
            key: base + "/" + key if value else None
            for key, value in check.crop_keys.items()
        },
        "reading": check.reading,
        "override_by": check.override_by,
        "override_at": utc_iso(check.override_at) if check.override_at else None,
    }


def claim_order(
    db: Session,
    actor: BrowserSession,
    order_id: str,
    expected: datetime,
    check_id: str,
    status: str,
    timestamp: datetime,
) -> None:
    # Match draft/status mutation lock order before claiming the order version.
    db.execute(
        update(OrderDraft)
        .where(OrderDraft.owner == actor.owner, OrderDraft.order_id == order_id)
        .values(revision=OrderDraft.revision + 1, updated_at=timestamp)
    )
    claimed = db.scalar(
        update(Order)
        .where(
            Order.owner == actor.owner,
            Order.id == order_id,
            Order.updated_at == expected,
            Order.status.in_(("confirmed", "packed")),
        )
        .values(status=status, active_pack_check_id=check_id, updated_at=timestamp)
        .returning(Order.id)
    )
    if claimed is None:
        raise HTTPException(
            409, "This order changed during the check. Reload and reshoot."
        )


def save_check(
    db: Session,
    actor: BrowserSession,
    order: Order,
    expected: datetime,
    check_id: str,
    photo: Original,
    analysis: dict[str, Any],
) -> PackCheck:
    require_current(order, expected)
    label_verdict, reasons = compare_label(analysis["reading"], order)
    bag_results = analysis["bag_results"]
    bag_values = {item["verdict"] for item in bag_results}
    bag_verdict = (
        "mismatch"
        if "mismatch" in bag_values
        else "match"
        if bag_values == {"match"}
        else "unsure"
    )
    verdict = (
        "fail"
        if label_verdict == "fail" or bag_verdict == "mismatch"
        else "pass"
        if label_verdict == "pass" and bag_verdict == "match"
        else "unsure"
    )
    timestamp = now()
    prefix = f"{actor.context}/{actor.owner}/pack/{check_id}"
    keys: list[str] = []
    crops: dict[str, str | None] = {"label": None, "bag": None}
    storage = ObjectStorage()
    try:
        photo_key = prefix + "/original"
        keys.append(photo_key)
        storage.put(photo_key, photo.data, photo.media_type)
        for name in crops:
            data = analysis["crops"].get(name)
            if data:
                crops[name] = prefix + "/" + name
                keys.append(str(crops[name]))
                storage.put(str(crops[name]), data, "image/jpeg")
        claim_order(
            db,
            actor,
            order.id,
            expected,
            check_id,
            "packed" if verdict == "pass" else "confirmed",
            timestamp,
        )
        check = PackCheck(
            id=check_id,
            owner=actor.owner,
            order_id=order.id,
            order_updated_at=timestamp,
            photo_key=photo_key,
            photo_media_type=photo.media_type,
            photo_sha256=hashlib.sha256(photo.data).hexdigest(),
            crop_keys=crops,
            sam_path=analysis["sam_path"],
            reading=analysis["reading"],
            reasons=reasons,
            bag_results=bag_results,
            verdict=verdict,
            label_verdict=label_verdict,
            bag_verdict=bag_verdict,
        )
        db.add(check)
        db.flush()
    except Exception:
        db.rollback()
        cleanup_objects(keys)
        raise
    try:
        db.commit()
    except Exception:
        db.rollback()
        # Preserve evidence after an ambiguous commit, like screenshot imports.
        try:
            with Session(db.get_bind()) as verification:
                published = verification.get(PackCheck, check_id)
            if published is None:
                cleanup_objects(keys)
        except Exception:
            pass
        raise
    return check


def override_check(
    db: Session,
    actor: BrowserSession,
    order: Order,
    check: PackCheck,
    expected: datetime,
) -> None:
    require_current(order, expected)
    if (
        order.active_pack_check_id != check.id
        or check.verdict != "unsure"
        or check.override_by
    ):
        raise HTTPException(
            409,
            "Only the current unsure check can be seller-overridden. Fix a failed check and reshoot.",
        )
    timestamp = now()
    claim_order(db, actor, order.id, expected, check.id, "packed", timestamp)
    check.override_by = actor.owner
    check.override_at = timestamp
    check.order_updated_at = timestamp
    db.commit()


def owned_check(
    db: Session, actor: BrowserSession, order_id: str, check_id: str
) -> PackCheck:
    check = db.scalar(
        select(PackCheck).where(
            PackCheck.id == check_id,
            PackCheck.owner == actor.owner,
            PackCheck.order_id == order_id,
        )
    )
    if check is None:
        raise HTTPException(404, "Pack check not found in this shop.")
    return check
