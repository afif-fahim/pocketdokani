import hashlib
import io
import textwrap
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import delete
from sqlalchemy.orm import Session

from pocketdokani.courier import FakeConsignment
from pocketdokani.db import now
from pocketdokani.imports import Original
from pocketdokani.money import LinePrice, calculate_cod
from pocketdokani.records import (
    CourierBooking,
    Order,
    OrderLine,
    PackCheck,
    Payout,
    Product,
    Sku,
    historical_order_id,
)

# Hand-authored constructed source; no real seller/customer identifiers or phones.
DEMO_SOURCE_ID = "constructed-conversation-001"
DEMO_FINAL_PRICE_BN = "চূড়ান্ত দাম: টোট ৪৫০ টাকা, শোল্ডার ব্যাগ ৫৫০ টাকা।"
DEMO_FINAL_PRICE_GLOSS = "Final price: tote 450 BDT, shoulder bag 550 BDT each."


def screenshots() -> list[Original]:
    font = ImageFont.load_default(size=22)
    title = ImageFont.load_default(size=28)
    batches = [
        [
            ("left", "1 blue canvas tote, 1 black shoulder bag."),
            ("right", "Tote 500, shoulder bag 600 BDT each."),
            ("left", "Final price aro kom hobe?"),
            ("right", DEMO_FINAL_PRICE_BN),
            ("left", "Ji, ei final price e order confirmed."),
        ],
        [
            ("left", "Name: Demo recipient"),
            ("left", "Address: Example Road, Dhaka"),
            ("left", "Phone: 01X-EXAMPLE (withheld in demo)"),
            ("right", "Customer delivery charge 80 BDT."),
            ("right", "Line discount 0 BDT for each item."),
            ("left", "I already paid 500 BDT."),
        ],
    ]
    result = []
    for sequence, bubbles in enumerate(batches, 1):
        image = Image.new("RGB", (720, 1400), "#f4f5f9")
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 720, 120), fill="#ffffff")
        draw.text((28, 26), "Demo customer | Messenger", font=title, fill="#203831")
        draw.text(
            (28, 75), "CONSTRUCTED - no real conversation", font=font, fill="#53645e"
        )
        y = 190
        for side, message in bubbles:
            x = 28 if side == "left" else 160
            draw.rounded_rectangle(
                (x, y, x + 530, y + 110),
                radius=24,
                fill="#e2e5ed" if side == "left" else "#d4eee5",
            )
            if message == DEMO_FINAL_PRICE_BN:
                # Pre-rendered with Bengali shaping; works without OS fonts/RAQM.
                # Keep this original quote separate from its explanatory gloss.
                with Image.open(
                    Path(__file__).with_name("assets")
                    / "constructed-final-price-bn.png"
                ) as original:
                    image.paste(original, (x + 20, y + 15), original)
                draw.text(
                    (x, y + 120),
                    "English gloss (guide, not source):",
                    font=ImageFont.load_default(size=18),
                    fill="#53645e",
                )
                draw.multiline_text(
                    (x, y + 147),
                    "\n".join(textwrap.wrap(DEMO_FINAL_PRICE_GLOSS, width=44)),
                    font=ImageFont.load_default(size=20),
                    fill="#53645e",
                )
                y += 60
            else:
                draw.multiline_text(
                    (x + 20, y + 25),
                    "\n".join(textwrap.wrap(message, width=40)),
                    font=font,
                    fill="#203831",
                )
            y += 170
        draw.text(
            (28, 1330),
            f"Development source | screenshot {sequence}/2",
            font=font,
            fill="#53645e",
        )
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        result.append(
            Original(
                f"constructed-{sequence:02}.png",
                buffer.getvalue(),
                "image/png",
                720,
                1400,
            )
        )
    return result


DEMO_PRODUCTS = [
    ("DEMO-TOTE", "Canvas tote", "Blue"),
    ("DEMO-SHOULDER", "Shoulder bag", "Black"),
    ("DEMO-CROSSBODY", "Crossbody bag", "Green"),
    ("DEMO-HANDBAG", "Small handbag", "Brown"),
    ("DEMO-POUCH", "Travel pouch", "Plum"),
]


def product_photo(product_id: str) -> bytes:
    colour = next(
        colour.lower() for key, _, colour in DEMO_PRODUCTS if key == product_id
    )
    photo = Image.new("RGB", (360, 300), "#f3f1e9")
    draw = ImageDraw.Draw(photo)
    draw.arc((125, 35, 235, 170), 180, 360, fill=colour, width=14)
    draw.rounded_rectangle((70, 95, 290, 250), radius=25, fill=colour)
    draw.text((18, 275), "CONSTRUCTED PRODUCT", fill="#203831")
    result = io.BytesIO()
    photo.save(result, format="WEBP")
    return result.getvalue()


def pack_photo(reference: str) -> bytes:
    """An illustration for the judge fixture, never a real packing photo."""
    photo = Image.new("RGB", (720, 540), "#f3f1e9")
    draw = ImageDraw.Draw(photo)
    title = ImageFont.load_default(size=26)
    body = ImageFont.load_default(size=20)
    draw.text((28, 24), "CONSTRUCTED PACKING FIXTURE", font=title, fill="#203831")
    draw.text(
        (28, 62),
        "Fake courier demo - no model check was run",
        font=body,
        fill="#53645e",
    )
    draw.rounded_rectangle((30, 125, 440, 450), radius=18, fill="#c8ab86")
    draw.rectangle((68, 170, 400, 365), fill="white")
    draw.text((88, 190), reference, font=title, fill="#203831")
    draw.multiline_text(
        (88, 237),
        "Demo recipient\nConstructed address\nPhone withheld\nNot a shipping label",
        font=body,
        fill="#203831",
        spacing=10,
    )
    draw.arc((510, 170, 650, 330), 180, 360, fill="brown", width=15)
    draw.rounded_rectangle((475, 265, 690, 435), radius=25, fill="brown")
    draw.text(
        (28, 490),
        "Illustration only - no real customer or parcel",
        font=body,
        fill="#53645e",
    )
    result = io.BytesIO()
    photo.save(result, format="WEBP")
    return result.getvalue()


def seed_shop(db: Session, owner: str, *, reset: bool = False) -> None:
    if owner == "shop" or owner == "judge-catalogue":
        raise ValueError("A constructed shop must belong to a judge session.")
    if not reset and db.get(Product, (owner, DEMO_PRODUCTS[0][0])) is not None:
        return
    if reset:
        for table in (
            CourierBooking,
            FakeConsignment,
            PackCheck,
            OrderLine,
            Order,
            Payout,
            Sku,
            Product,
        ):
            db.execute(delete(table).where(table.owner == owner))
        db.flush()
    for product_id, name, _ in DEMO_PRODUCTS:
        db.add(
            Product(
                owner=owner,
                product_id=product_id,
                name=f"Constructed {name.lower()}",
                photo_key=f"constructed/{product_id}.webp",
                photo_media_type="image/webp",
            )
        )
    db.flush()
    for index, (product_id, name, colour) in enumerate(DEMO_PRODUCTS):
        for received in (True, False):
            db.add(
                Sku(
                    owner=owner,
                    sku=f"{product_id}-{'R1' if received else 'T2'}",
                    product_id=product_id,
                    product_name=f"Constructed {name.lower()}",
                    variant=colour,
                    lot="DEMO-RECEIVED" if received else "DEMO-IN-TRANSIT",
                    lot_received=received,
                    constructed=True,
                    reviewed_by="constructed-fixture",
                    unit_cost=Decimal(250 + index * 50),
                    list_price=Decimal(500 + index * 100),
                    stock_qty=(0 if index == 4 else index + 1) if received else 3,
                )
            )
    db.flush()
    for index, status in enumerate(
        (
            "draft",
            "confirmed",
            "packed",
            "booked",
            "delivered",
            "delivered",
            "returned",
            "cancelled",
        ),
        1,
    ):
        source_id = f"DEMO-ORDER-{index:02}"
        order_id = historical_order_id(owner, source_id)
        timestamp = now()
        check_id = (
            historical_order_id(owner, source_id + "/pack")
            if status == "packed"
            else None
        )
        lines = [LinePrice(1, Decimal("600.00"), Decimal("50.00"))]
        if index == 2:
            lines.append(LinePrice(2, Decimal("500.00"), Decimal("100.00")))
        created = datetime(2026, 10, 10 + index, 6, tzinfo=timezone.utc)
        db.add(
            Order(
                owner=owner,
                id=order_id,
                reference=f"PD-DEMO-{index:04}",
                source_id=source_id,
                status=status,
                customer_name=f"Demo customer {index}",
                phone=None,
                address=f"Constructed address {index}; demonstration only",
                customer_delivery_charge=Decimal("80.00"),
                verified_prior_payment=Decimal("100.00"),
                cod_amount=calculate_cod(
                    lines,
                    customer_delivery_charge=Decimal("80.00"),
                    verified_prior_payment=Decimal("100.00"),
                ),
                consignment_id=f"FAKE-CONSIGNMENT-{index}"
                if status in ("booked", "delivered", "returned")
                else None,
                active_pack_check_id=check_id,
                payout_source_id=f"DEMO-PAYOUT-{index - 4}"
                if status == "delivered"
                else None,
                note=(
                    "Constructed packing authorization for the fake courier demonstration; no model check was run. No real customer or parcel."
                    if check_id
                    else "Hand-authored constructed order; no real customer or booking."
                ),
                created_at=created,
                updated_at=timestamp,
            )
        )
        db.flush()
        for sequence, line in enumerate(lines, 1):
            db.add(
                OrderLine(
                    owner=owner,
                    order_id=order_id,
                    line_number=sequence,
                    sku="DEMO-HANDBAG-R1"
                    if check_id
                    else f"{DEMO_PRODUCTS[(index + sequence) % len(DEMO_PRODUCTS)][0]}-R1",
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    line_discount=line.line_discount,
                    source_quote="Constructed historical example",
                )
            )
        if check_id:
            photo = pack_photo(f"PD-DEMO-{index:04}")
            reason = "Constructed fixture for fake courier booking; no model or real parcel check was run."
            db.add(
                PackCheck(
                    id=check_id,
                    owner=owner,
                    order_id=order_id,
                    created_at=timestamp,
                    order_updated_at=timestamp,
                    photo_key=f"constructed/pack/{owner}/{order_id}",
                    photo_media_type="image/webp",
                    photo_sha256=hashlib.sha256(photo).hexdigest(),
                    crop_keys={"label": None, "bag": None},
                    sam_path={
                        "constructed": True,
                        "label": {"path": "full_photo", "reason": reason},
                        "bag": {"path": "full_photo", "reason": reason},
                    },
                    reading={},
                    reasons=[
                        {
                            "field": "constructed_fixture",
                            "verdict": "pass",
                            "reason": reason,
                            "written": None,
                            "expected": None,
                        }
                    ],
                    bag_results=[
                        {
                            "line_number": 1,
                            "sku": "DEMO-HANDBAG-R1",
                            "verdict": "match",
                            "reason": reason,
                        }
                    ],
                    verdict="pass",
                    label_verdict="pass",
                    bag_verdict="match",
                )
            )
    for index, value in ((1, "450.00"), (2, "430.00")):
        db.add(
            Payout(
                owner=owner,
                source_id=f"DEMO-PAYOUT-{index}",
                paid_at=datetime(2026, 10, 20 + index, 6, tzinfo=timezone.utc),
                amount=Decimal(value),
                note="Constructed courier payout",
            )
        )
