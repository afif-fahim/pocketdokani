import io
import textwrap
from datetime import datetime, timezone
from decimal import Decimal

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import delete
from sqlalchemy.orm import Session

from pocketdokani.db import now
from pocketdokani.imports import Original
from pocketdokani.money import LinePrice, calculate_cod
from pocketdokani.records import (
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


def screenshots() -> list[Original]:
    font = ImageFont.load_default(size=22)
    title = ImageFont.load_default(size=28)
    batches = [
        [
            ("left", "1 blue canvas tote, 1 black shoulder bag."),
            ("right", "Tote 500, shoulder bag 600 BDT each."),
            ("left", "Final price aro kom hobe?"),
            ("right", "Final: tote 450, shoulder 550 BDT each."),
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
        for index, (side, message) in enumerate(bubbles):
            x = 28 if side == "left" else 160
            y = 190 + index * 170
            draw.rounded_rectangle(
                (x, y, x + 530, y + 110),
                radius=24,
                fill="#e2e5ed" if side == "left" else "#d4eee5",
            )
            draw.multiline_text(
                (x + 20, y + 25),
                "\n".join(textwrap.wrap(message, width=40)),
                font=font,
                fill="#203831",
            )
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


def seed_shop(db: Session, owner: str, *, reset: bool = False) -> None:
    if owner == "shop" or owner == "judge-catalogue":
        raise ValueError("A constructed shop must belong to a judge session.")
    if not reset and db.get(Product, (owner, DEMO_PRODUCTS[0][0])) is not None:
        return
    if reset:
        for table in (PackCheck, OrderLine, Order, Payout, Sku, Product):
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
                payout_source_id=f"DEMO-PAYOUT-{index - 4}"
                if status == "delivered"
                else None,
                note="Hand-authored constructed order; no real customer or booking.",
                created_at=created,
                updated_at=now(),
            )
        )
        db.flush()
        for sequence, line in enumerate(lines, 1):
            db.add(
                OrderLine(
                    owner=owner,
                    order_id=order_id,
                    line_number=sequence,
                    sku=f"{DEMO_PRODUCTS[(index + sequence) % len(DEMO_PRODUCTS)][0]}-R1",
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    line_discount=line.line_discount,
                    source_quote="Constructed historical example",
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
