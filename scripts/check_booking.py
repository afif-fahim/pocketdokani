"""Issue #6's automated exception: booking HTTP endpoints with a fake courier."""

import asyncio
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
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
from pocketdokani.config import settings  # noqa: E402
from pocketdokani.db import Base, database, now  # noqa: E402
from pocketdokani.main import app  # noqa: E402
from pocketdokani.records import BrowserSession, Order, OrderLine, PackCheck, Sku  # noqa: E402
from pocketdokani.security import digest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402


class BookingCheck(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.previous_storage = settings().local_storage_path
        settings().local_storage_path = Path(self.folder.name) / "objects"
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
        settings().local_storage_path = self.previous_storage
        self.folder.cleanup()

    async def orders(self):
        response = await self.client.get("/api/judge/orders")
        response.raise_for_status()
        return response.json()

    async def seed_seller_order(self):
        response = await self.client.post(
            "/api/seller/session", json={"passcode": "constructed-booking-check-only"}
        )
        response.raise_for_status()
        with Session(self.engine) as db:
            db.add(
                Order(
                    owner="shop",
                    id="seller-example",
                    reference="PD-SELLER-EXAMPLE",
                    status="confirmed",
                    customer_name="Constructed seller test",
                    phone=None,
                    address="Constructed address",
                    customer_delivery_charge=Decimal("80"),
                    verified_prior_payment=Decimal("0"),
                    cod_amount=Decimal("580"),
                    note="Constructed isolation check",
                )
            )
            db.commit()
        response = await self.client.get("/api/seller/orders")
        response.raise_for_status()
        return response.json()

    async def sample_draft(self):
        response = await self.client.post("/api/judge/session")
        response.raise_for_status()
        response = await self.client.post("/api/judge/example", json={})
        response.raise_for_status()
        workspace = response.json()
        path = f"/api/judge/workspaces/{workspace['id']}/draft"
        response = await self.client.post(path + "?sample=true")
        self.assertEqual(response.status_code, 200)
        return path, response.json()

    async def test_sample_draft_confirms_with_non_contactable_phone(self) -> None:
        path, draft = await self.sample_draft()
        self.assertIs(draft["sample"], True)
        self.assertEqual(draft["content"]["phone"]["value"], "01X-EXAMPLE")
        response = await self.client.post(
            path + "/confirm", json={"revision": draft["revision"]}
        )
        self.assertEqual(response.status_code, 200)
        reference = response.json()["order_reference"]
        order = next(
            item for item in await self.orders() if item["reference"] == reference
        )
        self.assertEqual(order["phone"], "01X-EXAMPLE")
        self.assertEqual(order["status"], "confirmed")
        self.assertEqual(Decimal(str(order["cod_amount"])), Decimal("1080"))

    async def confirmed_sample_order(self):
        path, draft = await self.sample_draft()
        response = await self.client.post(
            path + "/confirm", json={"revision": draft["revision"]}
        )
        response.raise_for_status()
        reference = response.json()["order_reference"]
        return next(
            item for item in await self.orders() if item["reference"] == reference
        )

    async def test_sample_mismatch_then_correction_books_same_order_once(self) -> None:
        order = await self.confirmed_sample_order()
        path = f"/api/judge/orders/{order['id']}/pack-checks"
        response = await self.client.post(
            path,
            data={
                "sample_scenario": "fail",
                "expected_updated_at": order["updated_at"],
            },
        )
        self.assertEqual(response.status_code, 201)
        check = response.json()
        self.assertEqual(check["verdict"], "fail")
        self.assertEqual(check["sam_path"]["label"]["path"], "constructed_sample")
        failed_order = next(
            item for item in await self.orders() if item["id"] == order["id"]
        )
        response = await self.client.post(
            path + f"/{check['id']}/override",
            json={"expected_updated_at": failed_order["updated_at"]},
        )
        self.assertEqual(response.status_code, 409)
        response = await self.client.post(
            path,
            data={
                "sample_scenario": "pass",
                "expected_updated_at": failed_order["updated_at"],
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["verdict"], "pass")
        packed_order = next(
            item for item in await self.orders() if item["id"] == order["id"]
        )
        response = await self.client.post(
            f"/api/judge/orders/{order['id']}/booking",
            json={"expected_updated_at": packed_order["updated_at"]},
        )
        self.assertEqual(response.json()["state"], "booked")
        self.assertEqual(response.json()["mode"], "fake")
        await self.client.post(
            f"/api/judge/orders/{order['id']}/booking",
            json={"expected_updated_at": packed_order["updated_at"]},
        )
        booked = next(item for item in await self.orders() if item["id"] == order["id"])
        self.assertEqual(booked["reference"], order["reference"])
        stock = (await self.client.get("/api/judge/stock")).json()
        tote = next(item for item in stock if item["sku"] == "DEMO-TOTE-R1")
        self.assertEqual(tote["stock_qty"], 0)

    async def test_synthetic_photo_is_available_without_claiming_a_model_result(
        self,
    ) -> None:
        order = await self.confirmed_sample_order()
        path = f"/api/judge/orders/{order['id']}/pack-checks"
        response = await self.client.get(path + "/sample-photo?scenario=fail")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertIn("attachment", response.headers["content-disposition"])
        checks = await self.client.get(path)
        self.assertEqual(checks.json(), [])

    async def test_judge_starters_have_orders_and_payouts_from_today(self) -> None:
        response = await self.client.post("/api/judge/session")
        response.raise_for_status()
        dhaka = timezone(timedelta(hours=6))
        today = now().astimezone(dhaka).date()
        orders = await self.orders()
        self.assertTrue(
            any(
                order["status"] == "confirmed"
                and datetime.fromisoformat(order["created_at"]).astimezone(dhaka).date()
                == today
                for order in orders
            )
        )
        payouts = (await self.client.get("/api/judge/payouts")).json()
        self.assertTrue(
            any(
                datetime.fromisoformat(payout["paid_at"]).astimezone(dhaka).date()
                == today
                for payout in payouts
            )
        )

    async def test_unsure_sample_requires_a_distinct_recorded_override(self) -> None:
        order = await self.confirmed_sample_order()
        path = f"/api/judge/orders/{order['id']}/pack-checks"
        response = await self.client.post(
            path,
            data={
                "sample_scenario": "unsure",
                "expected_updated_at": order["updated_at"],
            },
        )
        self.assertEqual(response.status_code, 201)
        check = response.json()
        self.assertEqual(check["verdict"], "unsure")
        self.assertIsNone(check["override_by"])
        current = next(
            item for item in await self.orders() if item["id"] == order["id"]
        )
        response = await self.client.post(
            f"/api/judge/orders/{order['id']}/booking",
            json={"expected_updated_at": current["updated_at"]},
        )
        self.assertEqual(response.status_code, 409)
        response = await self.client.post(
            path + f"/{check['id']}/override",
            json={"expected_updated_at": current["updated_at"]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["verdict"], "unsure")
        self.assertEqual(response.json()["override_by"], "booking-check")

    async def test_demo_marker_and_sample_readings_are_rejected_for_sellers(
        self,
    ) -> None:
        response = await self.client.post(
            "/api/seller/session", json={"passcode": "constructed-booking-check-only"}
        )
        response.raise_for_status()
        response = await self.client.post(
            "/api/seller/order-drafts",
            json={
                "request_id": "00000000-0000-4000-8000-000000000001",
                "values": {
                    "customer_name": "Constructed recipient",
                    "phone": "01X-EXAMPLE",
                    "address": "Example Road, Dhaka",
                    "customer_delivery_charge": "80",
                    "order_confirmed": "true",
                    "lines": [],
                },
            },
        )
        response.raise_for_status()
        path = f"/api/seller/workspaces/{response.json()['id']}/draft"
        response = await self.client.post(path + "?sample=true")
        self.assertEqual(response.status_code, 403)
        draft = (await self.client.get(path)).json()
        response = await self.client.post(
            path + "/confirm", json={"revision": draft["revision"]}
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("valid mobile number", response.json()["detail"])
        order = (await self.seed_seller_order())[0]
        response = await self.client.post(
            "/api/seller/orders/seller-example/pack-checks",
            data={
                "sample_scenario": "pass",
                "expected_updated_at": order["updated_at"],
            },
        )
        self.assertEqual(response.status_code, 403)
        response = await self.client.get(
            "/api/seller/orders/seller-example/pack-checks/sample-photo"
        )
        self.assertEqual(response.status_code, 403)

    async def test_reset_and_second_judge_cannot_affect_each_other_or_seller(
        self,
    ) -> None:
        order = await self.confirmed_sample_order()
        seller_before = await self.seed_seller_order()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8000",
            headers={"x-pocketdokani-request": "1"},
        ) as second:
            (await second.post("/api/judge/session")).raise_for_status()
            second_orders = (await second.get("/api/judge/orders")).json()
            response = await second.get(f"/api/judge/orders/{order['id']}/pack-checks")
            self.assertEqual(response.status_code, 404)
            response = await second.post(
                f"/api/judge/orders/{order['id']}/pack-checks",
                data={
                    "sample_scenario": "pass",
                    "expected_updated_at": order["updated_at"],
                },
            )
            self.assertEqual(response.status_code, 404)
            response = await self.client.post(
                "/api/judge/example", json={"reset": True}
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                (await second.get("/api/judge/orders")).json(), second_orders
            )
            self.assertFalse(
                any(item["id"] == order["id"] for item in await self.orders())
            )
            self.assertEqual(
                (await self.client.get("/api/seller/orders")).json(), seller_before
            )

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
