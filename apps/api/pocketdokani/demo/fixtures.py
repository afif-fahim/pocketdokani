import io
import textwrap
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFilter, ImageFont
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
DEMO_SOURCE_ID = "constructed-conversation-002"
DEMO_PHONE = "01X-EXAMPLE"
DEMO_FINAL_PRICE_BN = "চূড়ান্ত দাম: টোট ৪৫০ টাকা, শোল্ডার ব্যাগ ৫৫০ টাকা।"
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


def _draw_bag(
    draw: ImageDraw.ImageDraw, left: int, top: int, colour: str, scale: float = 1
) -> None:
    def scaled(*box: int) -> tuple[int, int, int, int]:
        x0, y0, x1, y1 = (round(value * scale) for value in box)
        return left + x0, top + y0, left + x1, top + y1

    draw.arc(scaled(55, 0, 165, 135), 180, 360, fill=colour, width=round(14 * scale))
    draw.rounded_rectangle(
        scaled(0, 60, 220, 215), radius=round(25 * scale), fill=colour
    )


def _soft_shadow(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=18, fill=(60, 50, 35, 90))
    blurred = layer.filter(ImageFilter.GaussianBlur(14))
    image.paste(blurred, (0, 0), blurred)


def parcel_input(
    order: Order, lines: list[dict[str, object]], scenario: ParcelInput
) -> Original:
    """Create an image for real model analysis, without a reading or verdict."""
    cod = order.cod_amount + (Decimal("100") if scenario == "wrong-cod" else Decimal(0))
    rows: list[tuple[str, str | None]] = [
        ("ORDER NO", order.label_reference),
        ("NAME", order.customer_name),
        ("NUMBER", None if scenario == "unreadable" else order.phone),
        ("ADDRESS", order.address),
        ("PRICE", f"{cod:.0f}/-"),
    ]
    image = Image.new("RGB", (1000, 820), "#e7dfd0")
    draw = ImageDraw.Draw(image)
    for x in range(0, 1000, 290):
        draw.line((x, 0, x, 820), fill="#d8cebb", width=2)
    for y in range(120, 820, 290):
        draw.line((0, y, 1000, y), fill="#d8cebb", width=2)

    written_rows = [
        (title, value, textwrap.wrap(value or "-", width=20)) for title, value in rows
    ]
    label_bottom = 210 + sum(
        max(78, 26 + 38 * len(wrapped)) for _, _, wrapped in written_rows
    )
    _soft_shadow(image, (44, 96, 626, label_bottom + 58))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((36, 84, 618, label_bottom + 46), radius=14, fill="#f7f5f0")

    draw.rectangle(
        (70, 130, 584, label_bottom), fill="white", outline="#2a2f33", width=3
    )
    heading = ImageFont.load_default(size=26)
    caption = ImageFont.load_default(size=19)
    written = ImageFont.load_default(size=30)
    draw.text((327, 170), "SHIPPING LABEL", font=heading, fill="#1f2528", anchor="mm")
    y = 210
    draw.line((70, y, 584, y), fill="#2a2f33", width=2)
    for title, value, wrapped in written_rows:
        height = max(78, 26 + 38 * len(wrapped))
        draw.text((86, y + 28), title, font=caption, fill="#4a5257")
        draw.line((206, y, 206, y + height), fill="#2a2f33", width=2)
        if value is None:
            for stroke in range(0, 300, 9):
                draw.line(
                    (
                        224 + stroke,
                        y + 18 + stroke % 27,
                        248 + stroke,
                        y + 60 - stroke % 31,
                    ),
                    fill="#17204a",
                    width=6,
                )
        else:
            draw.multiline_text(
                (222, y + 18), "\n".join(wrapped), font=written, fill="#17204a"
            )
        y += height
        draw.line((70, y, 584, y), fill="#2a2f33", width=2)

    for index, line in enumerate(lines):
        colour = _product_colour(str(line["sku"]).rsplit("-", 1)[0])
        top = 130 + index * 300
        _soft_shadow(image, (676, top + 74, 936, top + 250))
        draw = ImageDraw.Draw(image)
        _draw_bag(draw, 680, top, colour, 1.16)
        quantity = line.get("quantity", 1)
        if quantity != 1:
            draw.text((680, top + 262), f"x {quantity}", font=written, fill="#1f2528")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Original(
        f"constructed-parcel-{scenario}.png",
        buffer.getvalue(),
        "image/png",
        1000,
        820,
    )


CHAT_BATCHES: list[list[tuple[Literal["left", "right"], str]]] = [
    [
        ("left", "Apu, 1ta blue canvas tote ar 1ta black shoulder bag nibo."),
        ("right", "Tote 500, shoulder bag 600 taka."),
        ("left", "Final price aro kom hobe?"),
        ("right", DEMO_FINAL_PRICE_BN),
        ("left", "Ji, ei dame order confirm."),
    ],
    [
        ("left", "Nam: Demo recipient"),
        ("left", "Address: Example Road, Dhaka"),
        ("left", f"Phone: {DEMO_PHONE}"),
        ("right", "Delivery charge 80 taka. Extra discount nai."),
        ("left", "Ami 500 taka already pay korechi."),
        ("right", "Thik ache, check kore janacchi."),
    ],
]


def _chat_screenshot(
    bubbles: list[tuple[Literal["left", "right"], str]], time: str
) -> bytes:
    font = ImageFont.load_default(size=25)
    small = ImageFont.load_default(size=19)
    image = Image.new("RGB", (720, 1400), "#ffffff")
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 0, 720, 112), fill="#f7f8f9")
    draw.line((0, 112, 720, 112), fill="#e1e4e8", width=2)
    draw.ellipse((28, 26, 88, 86), fill="#8fa8c8")
    draw.text(
        (58, 56), "D", font=ImageFont.load_default(size=30), fill="white", anchor="mm"
    )
    draw.text(
        (106, 28),
        "Demo customer",
        font=ImageFont.load_default(size=28),
        fill="#14181c",
    )
    draw.text((106, 66), "Active now", font=small, fill="#5f6b76")
    draw.text((360, 150), time, font=small, fill="#7a858f", anchor="mm")

    y = 190
    for side, message in bubbles:
        quote = None
        wrapped = ""
        if message == DEMO_FINAL_PRICE_BN:
            # Pre-rendered with Bengali shaping; works without OS fonts/RAQM.
            with Image.open(
                Path(__file__).with_name("assets") / "constructed-final-price-bn.png"
            ) as original:
                quote = original.convert("RGBA")
            width, height = quote.width + 44, quote.height + 30
        else:
            wrapped = "\n".join(textwrap.wrap(message, width=34))
            left, top, right, bottom = draw.multiline_textbbox(
                (0, 0), wrapped, font=font, spacing=8
            )
            width, height = int(right - left) + 44, int(bottom - top) + 38
        x = 28 if side == "left" else 692 - width
        draw.rounded_rectangle(
            (x, y, x + width, y + height),
            radius=26,
            fill="#eceef1" if side == "left" else "#d3efe2",
        )
        if quote is not None:
            image.paste(quote, (x + 22, y + 15), quote)
        else:
            draw.multiline_text(
                (x + 22, y + 15), wrapped, font=font, fill="#14181c", spacing=8
            )
        y += height + 20

    draw.line((0, 1296, 720, 1296), fill="#e1e4e8", width=2)
    draw.rounded_rectangle((28, 1318, 692, 1376), radius=29, fill="#f1f2f4")
    draw.text((56, 1335), "Message", font=small, fill="#7a858f")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def screenshots() -> list[Original]:
    return [
        Original(
            f"constructed-{sequence:02}.png",
            _chat_screenshot(bubbles, time),
            "image/png",
            720,
            1400,
        )
        for sequence, (bubbles, time) in enumerate(
            zip(CHAT_BATCHES, ("Today 7:42 PM", "Today 7:46 PM"), strict=True), 1
        )
    ]


DEMO_PRODUCTS = [
    ("DEMO-TOTE", "Canvas tote", "Blue"),
    ("DEMO-SHOULDER", "Shoulder bag", "Black"),
    ("DEMO-CROSSBODY", "Crossbody bag", "Green"),
    ("DEMO-HANDBAG", "Small handbag", "Brown"),
    ("DEMO-POUCH", "Travel pouch", "Plum"),
]


def _product_colour(product_id: str) -> str:
    return next(colour.lower() for key, _, colour in DEMO_PRODUCTS if key == product_id)


def product_photo(product_id: str) -> bytes:
    photo = Image.new("RGB", (360, 300), "#f3f1e9")
    draw = ImageDraw.Draw(photo)
    _draw_bag(draw, 70, 35, _product_colour(product_id))
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
