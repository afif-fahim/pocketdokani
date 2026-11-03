"""Automated checks at the public COD calculation seam (issue #2)."""

import unittest
from decimal import Decimal

from pocketdokani.features.orders.money import LinePrice, calculate_cod


class CodCheck(unittest.TestCase):
    def test_invalid_money_and_quantity_are_rejected(self) -> None:
        for line in (
            LinePrice(0, Decimal("100"), Decimal("0")),
            LinePrice(-1, Decimal("100"), Decimal("0")),
            LinePrice(1, Decimal("-1"), Decimal("0")),
            LinePrice(1, Decimal("100"), Decimal("101")),
            LinePrice(1, Decimal("NaN"), Decimal("0")),
            LinePrice(1, Decimal("100.001"), Decimal("0")),
        ):
            with self.subTest(line=line), self.assertRaises(ValueError):
                calculate_cod(
                    [line],
                    customer_delivery_charge=Decimal("0"),
                    verified_prior_payment=Decimal("0"),
                )

    def test_multi_item_order_applies_each_amount_once(self) -> None:
        self.assertEqual(
            calculate_cod(
                [
                    LinePrice(2, Decimal("500.25"), Decimal("50.00")),
                    LinePrice(1, Decimal("700.00"), Decimal("100.00")),
                ],
                customer_delivery_charge=Decimal("80.00"),
                verified_prior_payment=Decimal("200.00"),
            ),
            Decimal("1430.50"),
        )

    def test_negative_cod_is_rejected_and_zero_is_allowed(self) -> None:
        line = LinePrice(1, Decimal("100.00"), Decimal("0.00"))
        with self.assertRaises(ValueError):
            calculate_cod(
                [line],
                customer_delivery_charge=Decimal("0.00"),
                verified_prior_payment=Decimal("100.01"),
            )
        self.assertEqual(
            calculate_cod(
                [line],
                customer_delivery_charge=Decimal("0.00"),
                verified_prior_payment=Decimal("100.00"),
            ),
            Decimal("0.00"),
        )


if __name__ == "__main__":
    unittest.main()
