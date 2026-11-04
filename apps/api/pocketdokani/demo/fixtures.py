import io
import textwrap
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from pocketdokani.data.db import now
from pocketdokani.data.records import (
    CourierBooking,
    Order,
    OrderLine,
    PackCheck,
    Payout,
    Product,
    Sku,
    historical_order_id,
)
from pocketdokani.features.conversations.imports import Original
from pocketdokani.features.courier.courier import FakeConsignment
from pocketdokani.features.orders.money import LinePrice, calculate_cod

# Hand-authored constructed source; no real seller/customer identifiers or phones.
DEMO_SOURCE_ID = "constructed-conversation-001"
DEMO_PHONE = "01X-EXAMPLE"
DEMO_FINAL_PRICE_BN = "চূড়ান্ত দাম: টোট ৪৫০ টাকা, শোল্ডার ব্যাগ ৫৫০ টাকা।"
DEMO_FINAL_PRICE_GLOSS = "Final price: tote 450 BDT, shoulder bag 550 BDT each."
ParcelInput = Literal["correct", "wrong-cod", "unreadable"]


def constructed_order(db: Session, owner: str, order_id: str) -> bool:
    flags = list(
        db.scalars(
            select(Sku.constructed)
            .join(
                OrderLine, (OrderLine.owner == Sku.owner) & (OrderLine.sku == Sku.sku)
            )
            .where(OrderLine.owner == owner, OrderLine.order_id == order_id)
        )
    )
    return owner != "shop" and bool(flags) and all(flags)


def parcel_input(
    order: Order, lines: list[dict[str, object]], scenario: ParcelInput
) -> Original:
    """Create an image for real model analysis, without a reading or verdict."""
    cod = order.cod_amount + (Decimal("100") if scenario == "wrong-cod" else Decimal(0))
    phone = None if scenario == "unreadable" else order.phone
    fields: dict[str, str | None] = {
        "order_reference": order.label_reference,
        "customer_name": order.customer_name,
        "phone": phone,
        "cod_amount": str(cod),
        "address": order.address,
    }
    image = Image.new("RGB", (1000, 820), "#f3f1e9")
    draw = ImageDraw.Draw(image)
    title = ImageFont.load_default(size=28)
    body = ImageFont.load_default(size=23)
    draw.text((25, 24), "CONSTRUCTED PARCEL INPUT", font=title, fill="#203831")
    draw.text(
        (25, 70),
        "Synthetic input for AI parcel analysis",
        font=body,
        fill="#53645e",
    )
    draw.rounded_rectangle((25, 125, 630, 735), radius=20, fill="#c8ab86")
    draw.rectangle((55, 160, 600, 690), fill="white")
    y = 185
    for key, value in fields.items():
        label = {
            "order_reference": "Order number",
            "customer_name": "Recipient",
            "cod_amount": "COD BDT",
        }.get(key, key.title())
        text = f"{label}: {value or '[obscured]'}"
        for row in textwrap.wrap(text, width=36):
            draw.text((75, y), row, font=body, fill="#203831")
            y += 35
        y += 20
    for index, line in enumerate(lines):
        sku = str(line["sku"])
        product_id = sku.rsplit("-", 1)[0]
        photo = Image.open(io.BytesIO(product_photo(product_id))).convert("RGB")
        photo.thumbnail((300, 220))
        image.paste(photo, (665, 145 + index * 270))
        draw.text(
            (660, 370 + index * 270),
            f"Quantity: {line.get('quantity', 1)}",
            font=body,
            fill="#203831",
        )
    draw.text(
        (25, 770),
        f"Input variant: {scenario}. Not a shipping label.",
        font=body,
        fill="#53645e",
    )
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Original(
        f"constructed-parcel-{scenario}.png",
        buffer.getvalue(),
        "image/png",
        1000,
        820,
    )


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
        draw.text((28, 26), "Demo customer | Sales chat", font=title, fill="#203831")
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
                    quote_image = original.convert("RGBA")
                    image.paste(quote_image, (x + 20, y + 15), quote_image)
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
            "confirmed",
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
        lines = [LinePrice(1, Decimal("600.00"), Decimal("50.00"))]
        if index == 2:
            lines.append(LinePrice(2, Decimal("500.00"), Decimal("100.00")))
        # Seed relative dates so "today" questions work in each fresh/reset shop.
        created = timestamp - timedelta(days=(0, 0, 0, 1, 0, 1, 2, 3)[index - 1])
        db.add(
            Order(
                owner=owner,
                id=order_id,
                reference=f"PD-DEMO-{index:04}",
                source_id=source_id,
                status=status,
                customer_name=f"Demo customer {index}",
                phone=DEMO_PHONE,
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
                note="Constructed business record; no real customer or booking.",
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
                    if index == 3
                    else f"{DEMO_PRODUCTS[(index + sequence) % len(DEMO_PRODUCTS)][0]}-R1",
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
                paid_at=now() - timedelta(days=index - 1),
                amount=Decimal(value),
                note="Constructed courier payout",
            )
        )
