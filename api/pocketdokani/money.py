"""The single order money calculation from ADR 0002, in BDT."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class LinePrice:
    quantity: int
    unit_price: Decimal
    line_discount: Decimal


def calculate_cod(
    lines: Sequence[LinePrice],
    *,
    customer_delivery_charge: Decimal,
    verified_prior_payment: Decimal,
) -> Decimal:
    if not lines:
        raise ValueError("An order needs at least one line.")
    amounts = [customer_delivery_charge, verified_prior_payment]
    for line in lines:
        if (
            isinstance(line.quantity, bool)
            or not isinstance(line.quantity, int)
            or line.quantity <= 0
        ):
            raise ValueError("Order line quantity must be a positive whole number.")
        amounts.extend((line.unit_price, line.line_discount))
    if any(
        not value.is_finite() or value < 0 or value != value.quantize(Decimal("0.01"))
        for value in amounts
    ):
        raise ValueError(
            "Use finite, non-negative BDT amounts with at most two decimal places."
        )
    if any(line.line_discount > line.quantity * line.unit_price for line in lines):
        raise ValueError("Line discount cannot exceed the line's price.")
    cod = (
        sum(
            (line.quantity * line.unit_price - line.line_discount for line in lines),
            Decimal(0),
        )
        + customer_delivery_charge
        - verified_prior_payment
    )
    if cod < 0:
        raise ValueError("COD amount cannot be negative.")
    return cod
