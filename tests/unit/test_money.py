"""COD calculation tests at the public money calculation boundary."""

from decimal import Decimal

import pytest
from pocketdokani.features.orders.money import LinePrice, calculate_cod


@pytest.mark.parametrize(
    "line",
    [
        pytest.param(LinePrice(0, Decimal("100"), Decimal("0")), id="zero-quantity"),
        pytest.param(
            LinePrice(-1, Decimal("100"), Decimal("0")), id="negative-quantity"
        ),
        pytest.param(
            LinePrice(1, Decimal("-1"), Decimal("0")), id="negative-unit-price"
        ),
        pytest.param(
            LinePrice(1, Decimal("100"), Decimal("101")),
            id="discount-exceeds-line-price",
        ),
        pytest.param(
            LinePrice(1, Decimal("NaN"), Decimal("0")), id="non-finite-unit-price"
        ),
        pytest.param(
            LinePrice(1, Decimal("100.001"), Decimal("0")),
            id="unit-price-exceeds-two-decimal-places",
        ),
    ],
)
def test_invalid_line_money_and_quantity_are_rejected(line: LinePrice) -> None:
    with pytest.raises(ValueError):
        calculate_cod(
            [line],
            customer_delivery_charge=Decimal("0"),
            verified_prior_payment=Decimal("0"),
        )


def test_multi_item_order_applies_each_amount_once() -> None:
    cod = calculate_cod(
        [
            LinePrice(2, Decimal("500.25"), Decimal("50.00")),
            LinePrice(1, Decimal("700.00"), Decimal("100.00")),
        ],
        customer_delivery_charge=Decimal("80.00"),
        verified_prior_payment=Decimal("200.00"),
    )

    assert cod == Decimal("1430.50")


def test_negative_cod_is_rejected() -> None:
    with pytest.raises(ValueError):
        calculate_cod(
            [LinePrice(1, Decimal("100.00"), Decimal("0.00"))],
            customer_delivery_charge=Decimal("0.00"),
            verified_prior_payment=Decimal("100.01"),
        )


def test_zero_cod_is_allowed() -> None:
    cod = calculate_cod(
        [LinePrice(1, Decimal("100.00"), Decimal("0.00"))],
        customer_delivery_charge=Decimal("0.00"),
        verified_prior_payment=Decimal("100.00"),
    )

    assert cod == Decimal("0.00")
