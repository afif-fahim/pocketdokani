"""The single order money calculation from ADR 0002, in BDT."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class LinePrice:
    quantity: int
    unit_price: Decimal
    line_discount: Decimal

    def total(self) -> Decimal:
        if (
            isinstance(self.quantity, bool)
            or not isinstance(self.quantity, int)
            or self.quantity <= 0
        ):
            raise ValueError("Order line quantity must be a positive whole number.")
        _validate_amounts((self.unit_price, self.line_discount))
        gross = self.quantity * self.unit_price
        if self.line_discount > gross:
            raise ValueError("Line discount cannot exceed the line's price.")
        return gross - self.line_discount


def _validate_amounts(amounts: Sequence[Decimal]) -> None:
    if any(
        not value.is_finite() or value < 0 or value != value.quantize(Decimal("0.01"))
        for value in amounts
    ):
        raise ValueError(
            "Use finite, non-negative BDT amounts with at most two decimal places."
        )


def calculate_cod(
    lines: Sequence[LinePrice],
    *,
    customer_delivery_charge: Decimal,
    verified_prior_payment: Decimal,
) -> Decimal:
    if not lines:
        raise ValueError("An order needs at least one line.")
    _validate_amounts((customer_delivery_charge, verified_prior_payment))
    cod = (
        sum((line.total() for line in lines), Decimal(0))
        + customer_delivery_charge
        - verified_prior_payment
    )
    if cod < 0:
        raise ValueError("COD amount cannot be negative.")
    return cod
