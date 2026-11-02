"""Issue #6's automated exception: booking HTTP endpoints with a fake courier."""

import asyncio
import os
import tempfile
import unittest
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

# Never load the seller's database, storage or credentials into these checks.
os.environ.update(
    ENVIRONMENT="development",
    DATABASE_URL="sqlite://",
    STORAGE_BACKEND="local",
    SHOP_PASSCODE="constructed-booking-check-only",
    STEADFAST_LIVE_ENABLED="false",
    STEADFAST_API_KEY="",
    STEADFAST_SECRET_KEY="",
    MODEL_CALLS_ENABLED="false",
    MODEL_API_KEY="",
)

import httpx  # noqa: E402
from pocketdokani.db import Base, database, now  # noqa: E402
from pocketdokani.main import app  # noqa: E402
from pocketdokani.records import BrowserSession, Order, OrderLine, PackCheck, Sku  # noqa: E402
from pocketdokani.security import digest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402


class BookingCheck(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        path = Path(self.folder.name) / "booking.db"
        self.engine = create_engine(f"sqlite:///{path}", connect_args={"timeout": 15})
        Base.metadata.create_all(self.engine)

        def test_database():
            with Session(self.engine, expire_on_commit=False) as db:
                yield db

        app.dependency_overrides[database] = test_database
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8000",
            headers={"x-pocketdokani-request": "1"},
            cookies={"pd_judge": "constructed-booking-session"},
        )
        timestamp = now()
        with Session(self.engine) as db:
            db.add(
                BrowserSession(
                    token_hash=digest("constructed-booking-session"),
                    context="judge",
                    owner="booking-check",
                    expires_at=now() + timedelta(hours=1),
                )
            )
            db.add(
                Sku(
                    owner="booking-check",
                    sku="EXAMPLE-BLUE",
                    product_name="Example bag",
                    variant="Blue",
                    lot="EXAMPLE-LOT",
                    lot_received=True,
                    constructed=True,
                    reviewed_by="constructed-check",
                    stock_qty=4,
                )
            )
            db.add(
                Order(
                    owner="booking-check",
                    id="example-order",
                    reference="PD-EXAMPLE-0001",
                    status="packed",
                    customer_name="Constructed recipient",
                    phone=None,
                    address="Constructed address",
                    customer_delivery_charge=Decimal("80"),
                    verified_prior_payment=Decimal("0"),
                    cod_amount=Decimal("580"),
                    active_pack_check_id="example-check",
                    note="Constructed booking check",
                    updated_at=timestamp,
                )
            )
            db.flush()
            db.add(
                OrderLine(
                    owner="booking-check",
                    order_id="example-order",
                    line_number=1,
                    sku="EXAMPLE-BLUE",
                    quantity=1,
                    unit_price=Decimal("500"),
                    line_discount=Decimal("0"),
                )
            )
            db.add(
                PackCheck(
                    id="example-check",
                    owner="booking-check",
                    order_id="example-order",
                    order_updated_at=timestamp,
                    photo_key="constructed/check",
                    photo_media_type="image/jpeg",
                    photo_sha256="0" * 64,
                    crop_keys={},
                    sam_path={},
                    reading={},
                    reasons=[],
                    bag_results=[],
                    verdict="pass",
                    label_verdict="pass",
                    bag_verdict="match",
                )
            )
            db.commit()
        self.url = "/api/judge/orders/example-order/booking"
        self.expected = (await self.orders())[0]["updated_at"]

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.folder.cleanup()

    async def orders(self):
        response = await self.client.get("/api/judge/orders")
        response.raise_for_status()
        return response.json()

    async def test_repeated_and_concurrent_booking_keeps_one_consignment(self) -> None:
        responses = await asyncio.gather(
            *[
                self.client.post(self.url, json={"expected_updated_at": self.expected})
                for _ in range(2)
            ]
        )
        self.assertTrue(
            all(response.status_code in (200, 409) for response in responses)
        )
        first = (await self.orders())[0]
        self.assertEqual(first["status"], "booked")
        response = await self.client.post(
            self.url, json={"expected_updated_at": self.expected}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            (await self.orders())[0]["consignment_id"], first["consignment_id"]
        )
        stock = (await self.client.get("/api/judge/stock")).json()
        self.assertEqual(stock[0]["stock_qty"], 3)

    async def test_timeout_requires_invoice_lookup_before_retry(self) -> None:
        response = await self.client.post(
            self.url,
            json={"expected_updated_at": self.expected, "fake_scenario": "timeout"},
        )
        self.assertEqual(response.json()["state"], "booking_unknown")
        stock = (await self.client.get("/api/judge/stock")).json()[0]
        self.assertEqual((stock["stock_qty"], stock["available_qty"]), (4, 3))
        # A blind retry is a read of the unresolved attempt, never another create.
        response = await self.client.post(
            self.url, json={"expected_updated_at": self.expected}
        )
        self.assertEqual(response.json()["state"], "booking_unknown")
        order = (await self.orders())[0]
        cancelled = await self.client.post(
            "/api/judge/orders/example-order/status",
            json={
                "status": "cancelled",
                "expected_status": "packed",
                "expected_updated_at": order["updated_at"],
            },
        )
        self.assertEqual(cancelled.status_code, 409)
        response = await self.client.post(self.url + "/reconcile", json={})
        self.assertEqual(response.json()["state"], "not_found")
        response = await self.client.post(
            self.url, json={"expected_updated_at": order["updated_at"]}
        )
        self.assertEqual(response.json()["state"], "booked")
        stock = (await self.client.get("/api/judge/stock")).json()[0]
        self.assertEqual(stock["stock_qty"], 3)

    async def test_late_success_is_recovered_and_return_restores_stock_once(
        self,
    ) -> None:
        response = await self.client.post(
            self.url,
            json={
                "expected_updated_at": self.expected,
                "fake_scenario": "late_success",
            },
        )
        self.assertEqual(response.json()["state"], "booking_unknown")
        # A new HTTP client models a caller reconnecting after the lost response.
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8000",
            headers={"x-pocketdokani-request": "1"},
            cookies={"pd_judge": "constructed-booking-session"},
        ) as reconnected:
            response = await reconnected.post(self.url + "/reconcile", json={})
            self.assertEqual(response.json()["state"], "booked")
        booked = (await self.orders())[0]
        again = await self.client.post(self.url + "/reconcile", json={})
        self.assertEqual(again.json()["state"], "booked")
        self.assertEqual(
            (await self.orders())[0]["consignment_id"], booked["consignment_id"]
        )
        payload = {
            "status": "returned",
            "expected_status": "booked",
            "expected_updated_at": booked["updated_at"],
        }
        response = await self.client.post(
            "/api/judge/orders/example-order/status", json=payload
        )
        self.assertEqual(response.status_code, 200)
        response = await self.client.post(
            "/api/judge/orders/example-order/status", json=payload
        )
        self.assertEqual(response.status_code, 409)
        stock = (await self.client.get("/api/judge/stock")).json()[0]
        self.assertEqual(stock["stock_qty"], 4)

    async def test_duplicate_invoice_adopts_existing_consignment(self) -> None:
        response = await self.client.post(
            self.url,
            json={"expected_updated_at": self.expected, "fake_scenario": "duplicate"},
        )
        self.assertEqual(response.json()["state"], "booked")
        stock = (await self.client.get("/api/judge/stock")).json()[0]
        self.assertEqual(stock["stock_qty"], 3)


if __name__ == "__main__":
    unittest.main()
