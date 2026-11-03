"""Read the existing business workbook without evaluating Excel formulas.

The workbook must have been recalculated and saved in Excel/LibreOffice. Cached
results are required and reconciled with the entered line prices and stock.
"""

import hashlib
import io
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from openpyxl import load_workbook
from PIL import Image, ImageOps

from pocketdokani.money import LinePrice, calculate_cod
from pocketdokani.records import (
    Order,
    OrderLine,
    Payout,
    Product,
    Sku,
    historical_order_id,
)

MONEY_UNIT = Decimal("0.01")
STATES = {
    "Pending": "confirmed",
    "Shipped": "booked",
    "Delivered": "delivered",
    "Returned": "returned",
    "Cancelled": "cancelled",
}


def text(value: Any, *, required: bool = True, maximum: int = 100) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    result = str(value).strip() if value is not None else ""
    if (required and not result) or len(result) > maximum or result.startswith("#"):
        raise ValueError("Missing or invalid text/identifier.")
    return result


def amount(value: Any, *, blank_zero: bool = False) -> Decimal:
    if value is None and blank_zero:
        return Decimal("0.00")
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("Missing numeric value. Recalculate and save the workbook.")
    try:
        number = Decimal(str(value))
        if not number.is_finite() or not 0 <= number < Decimal("1000000000000"):
            raise ValueError("Amount must be finite and non-negative.")
        return number.quantize(MONEY_UNIT, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        raise ValueError("Invalid amount.") from None


def quantity(value: Any, *, positive: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Missing stock quantity.")
    if value != int(value) or not (1 if positive else 0) <= value < 2**31:
        raise ValueError("Quantity must be a non-negative whole number.")
    return int(value)


def timestamp(value: Any) -> datetime:
    if not isinstance(value, datetime):
        raise ValueError("Missing date.")
    return value.replace(tzinfo=ZoneInfo("Asia/Dhaka"))


@dataclass
class BusinessData:
    sha256: str
    products: list[Product] = field(default_factory=list)
    skus: list[Sku] = field(default_factory=list)
    orders: list[Order] = field(default_factory=list)
    lines: list[OrderLine] = field(default_factory=list)
    payouts: list[Payout] = field(default_factory=list)
    photos: dict[str, bytes] = field(default_factory=dict)

    def counts(self) -> dict[str, int]:
        return {
            "products": len(self.products),
            "skus": len(self.skus),
            "orders": len(self.orders),
            "order_lines": len(self.lines),
            "payouts": len(self.payouts),
            "photos": len(self.photos),
        }


def read_workbook(path: Path, reviewed_by: str) -> BusinessData:
    raw = path.read_bytes()
    result = BusinessData(hashlib.sha256(raw).hexdigest())
    book = load_workbook(io.BytesIO(raw), data_only=True)
    location = "Workbook"
    try:
        # Refuse a changed template rather than silently reading another column.
        for sheet, column, expected in (
            ("Products", "B4", "Product ID"),
            ("Products", "V4", "Landed cost (current)"),
            ("Stock", "A4", "SKU (fixed ID)"),
            ("Stock", "K4", "Available to sell"),
            ("Orders", "L4", "AGREED unit price (recorded)"),
            ("Orders", "AL4", "COD to collect"),
            ("Payouts", "A4", "Statement no."),
        ):
            if book[sheet][column].value != expected:
                raise ValueError("Unsupported workbook template.")
        lots: dict[str, bool] = {}
        for col in range(2, book["Lots"].max_column + 1):
            lot = book["Lots"].cell(4, col).value
            if lot is None:
                break
            location = f"Lots column {col}"
            status = text(book["Lots"].cell(7, col).value)
            if status not in (
                "Planning",
                "Ordered",
                "In transit",
                "Received",
                "Selling",
                "Closed",
            ):
                raise ValueError("Unknown lot status.")
            received = status in ("Received", "Selling", "Closed")
            if received and not isinstance(book["Lots"].cell(9, col).value, datetime):
                raise ValueError("A received lot needs its arrival date.")
            name = text(lot, maximum=80)
            if name in lots:
                raise ValueError("Duplicate lot identifier.")
            lots[name] = received

        # openpyxl exposes embedded drawings only through these private members.
        # Read each image once and normalise it to remove metadata and bound size.
        photos: dict[int, bytes] = {}
        for embedded in book["Products"]._images:  # type: ignore[attr-defined]
            row_number = embedded.anchor._from.row + 1
            if row_number in photos:
                raise ValueError("Multiple photos on one product row.")
            with Image.open(io.BytesIO(embedded._data())) as photo:
                clean = ImageOps.exif_transpose(photo).convert("RGB")
                clean.thumbnail((1200, 1200))
                output = io.BytesIO()
                clean.save(output, format="WEBP", quality=90)
                photos[row_number] = output.getvalue()

        products: dict[str, tuple[Product, str, Decimal, Decimal]] = {}
        for row_number, row in enumerate(
            book["Products"].iter_rows(min_row=5, values_only=True), 5
        ):
            if row[1] is None:
                continue
            location = f"Products row {row_number}"
            product_id = text(row[1], maximum=80)
            lot = text(row[2], maximum=80)
            if product_id in products or lot not in lots:
                raise ValueError("Duplicate product or unknown lot.")
            photo_key = None
            if row_number in photos:
                data = photos[row_number]
                photo_key = (
                    f"seller/shop/products/{hashlib.sha256(data).hexdigest()}.webp"
                )
                result.photos[photo_key] = data
            product = Product(
                owner="shop",
                product_id=product_id,
                name=text(row[4], maximum=160),
                photo_key=photo_key,
                photo_media_type="image/webp" if photo_key else None,
            )
            result.products.append(product)
            products[product_id] = (product, lot, amount(row[21]), amount(row[14]))

        sku_ids: set[str] = set()
        for row_number, row in enumerate(
            book["Stock"].iter_rows(min_row=5, values_only=True), 5
        ):
            if row[0] is None:
                continue
            location = f"Stock row {row_number}"
            sku_id = text(row[0], maximum=80)
            product, lot, cost, list_price = products[text(row[1], maximum=80)]
            if sku_id in sku_ids:
                raise ValueError("Duplicate SKU identifier.")
            sku_ids.add(sku_id)
            remaining = quantity(row[3]) - sum(quantity(row[i]) for i in (6, 7, 8, 9))
            if quantity(row[10]) != remaining:
                raise ValueError(
                    "Cached stock does not reconcile. Recalculate and save."
                )
            result.skus.append(
                Sku(
                    owner="shop",
                    sku=sku_id,
                    product_id=product.product_id,
                    product_name=product.name,
                    variant=text(row[2], maximum=80),
                    lot=lot,
                    lot_received=lots[lot],
                    constructed=False,
                    reviewed_by=reviewed_by,
                    unit_cost=cost,
                    list_price=list_price,
                    stock_qty=remaining,
                )
            )

        grouped: dict[str, list[tuple[int, tuple[Any, ...]]]] = defaultdict(list)
        for row_number, row in enumerate(
            book["Orders"].iter_rows(min_row=5, values_only=True), 5
        ):
            if row[0] is not None:
                grouped[text(row[0])].append((row_number, row))
        for source_id, rows in grouped.items():
            first_number, first = rows[0]
            location = f"Orders row {first_number}"
            order_id = historical_order_id("shop", source_id)
            charge = amount(first[15], blank_zero=True)
            prior_payment = amount(first[16], blank_zero=True) + amount(
                first[17], blank_zero=True
            )
            line_prices: list[LinePrice] = []
            for sequence, (row_number, row) in enumerate(rows, 1):
                location = f"Orders row {row_number}"
                sku = text(row[7], maximum=80)
                if sku not in sku_ids or (row[2] is not None and row[2] != first[2]):
                    raise ValueError("Unknown order SKU or inconsistent order status.")
                if sequence > 1 and any(
                    row[i] is not None and row[i] != first[i] for i in (4, 5, 6, 19, 20)
                ):
                    raise ValueError(
                        "Conflicting recipient or delivery details within one order."
                    )
                # Order-level money belongs to the first line. Reject repeats.
                if sequence > 1 and any(
                    row[i] is not None for i in (15, 16, 17, 18, 21, 22, 23)
                ):
                    raise ValueError(
                        "Order-level amounts must appear on the first line only."
                    )
                price = LinePrice(
                    quantity(row[9], positive=True),
                    amount(row[11]),
                    amount(row[13], blank_zero=True),
                )
                if price.total() != amount(row[14]):
                    raise ValueError("Cached line total does not reconcile.")
                line_prices.append(price)
                result.lines.append(
                    OrderLine(
                        owner="shop",
                        order_id=order_id,
                        line_number=sequence,
                        sku=sku,
                        quantity=price.quantity,
                        unit_price=price.unit_price,
                        line_discount=price.line_discount,
                        source_quote=f"Historical workbook, Orders row {row_number}",
                    )
                )
            cod = calculate_cod(
                line_prices,
                customer_delivery_charge=charge,
                verified_prior_payment=prior_payment,
            )
            location = f"Orders row {first_number}"
            if cod != amount(first[37]):
                raise ValueError("Cached COD does not reconcile with ADR 0002.")
            created = timestamp(first[1])
            result.orders.append(
                Order(
                    owner="shop",
                    id=order_id,
                    reference="PD-" + order_id.replace("-", "")[:12].upper(),
                    source_id=source_id,
                    status=STATES[text(first[2])],
                    customer_name=text(first[4], required=False, maximum=160) or None,
                    phone=text(first[5], required=False, maximum=40) or None,
                    address=text(first[6], required=False, maximum=4000) or None,
                    customer_delivery_charge=charge,
                    verified_prior_payment=prior_payment,
                    cod_amount=cod,
                    consignment_id=text(first[20], required=False) or None,
                    payout_source_id=text(first[23], required=False) or None,
                    note=f"Historical order ID: {source_id}. Imported from seller-reviewed records.",
                    created_at=created,
                    updated_at=created,
                    active_pack_check_id=None,
                )
            )

        payout_ids: set[str] = set()
        for row_number, row in enumerate(
            book["Payouts"].iter_rows(min_row=5, values_only=True), 5
        ):
            if row[0] is None or str(row[0]).startswith("Expected = for each order"):
                continue
            location = f"Payouts row {row_number}"
            source_id = text(row[0])
            if source_id in payout_ids:
                raise ValueError("Duplicate payout statement.")
            payout_ids.add(source_id)
            result.payouts.append(
                Payout(
                    owner="shop",
                    source_id=source_id,
                    paid_at=timestamp(row[2]),
                    amount=amount(row[3]),
                    note=text(row[4], required=False, maximum=4000),
                )
            )
        if not products or not sku_ids or not result.orders or not result.payouts:
            raise ValueError("Business records are missing.")
        return result
    except (ValueError, KeyError, IndexError, OSError) as error:
        # Never echo customer details or raw library exceptions into logs.
        detail = (
            str(error)
            if isinstance(error, ValueError)
            else "Missing or invalid source data."
        )
        raise ValueError(f"{location}: {detail}") from None
    finally:
        book.close()
