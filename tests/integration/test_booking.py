"""Order, packing and booking workflows through the HTTP API with fake providers."""

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
import pytest
from pocketdokani.core.config import settings
from pocketdokani.data.db import now
from pocketdokani.data.records import Order
from pocketdokani.main import app
from pydantic import SecretStr
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

BOOKING_URL = "/api/judge/orders/example-order/booking"


async def orders(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await client.get("/api/judge/orders")
    response.raise_for_status()
    return response.json()


async def seed_seller_order(
    client: httpx.AsyncClient, engine: Engine
) -> list[dict[str, Any]]:
    response = await client.post(
        "/api/seller/session", json={"passcode": "constructed-booking-check-only"}
    )
    response.raise_for_status()
    with Session(engine) as db:
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
    response = await client.get("/api/seller/orders")
    response.raise_for_status()
    return response.json()


@contextmanager
def provider(**results: dict[str, Any]) -> Iterator[None]:
    """Substitute only the external Meta HTTP boundary, never app analysis."""
    config = settings()
    client_type = httpx.Client

    def respond(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.meta.ai/v1/chat/completions"
        payload = json.loads(request.content)
        schema = payload["response_format"]["json_schema"]["name"]
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(results[schema])},
                    }
                ]
            },
        )

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(config, "model_calls_enabled", True)
        monkeypatch.setattr(
            config, "model_api_key", SecretStr("synthetic-provider-check")
        )
        monkeypatch.setattr(
            httpx,
            "Client",
            lambda **kwargs: client_type(
                transport=httpx.MockTransport(respond), **kwargs
            ),
        )
        yield


async def extracted_draft(client: httpx.AsyncClient) -> tuple[str, dict[str, Any]]:
    (await client.post("/api/judge/session")).raise_for_status()
    workspace = (await client.post("/api/judge/example", json={})).json()
    path = f"/api/judge/workspaces/{workspace['id']}/draft"

    def field(value: str, quote: str, screenshot: int) -> dict[str, Any]:
        return {
            "value": value,
            "quote": quote,
            "screenshot_index": screenshot,
            "voice_note_id": None,
        }

    reading = {
        "customer_name": field("AI test recipient", "Name: AI test recipient", 2),
        "phone": field("01X-EXAMPLE", "Phone: 01X-EXAMPLE", 2),
        "address": field("Example Road, Dhaka", "Address: Example Road, Dhaka", 2),
        "customer_delivery_charge": field("80", "Customer delivery charge 80 BDT.", 2),
        "order_confirmed": field("true", "order confirmed", 1),
        "lines": [
            {
                "sku": field(sku, "1 blue canvas tote, 1 black shoulder bag.", 1),
                "quantity": field("1", "1 blue canvas tote, 1 black shoulder bag.", 1),
                "unit_price": field(
                    price, "Final price: tote 450 BDT, shoulder bag 550 BDT each.", 1
                ),
                "line_discount": field("0", "Line discount 0 BDT for each item.", 2),
            }
            for sku, price in (("DEMO-TOTE-R1", "450"), ("DEMO-SHOULDER-R1", "550"))
        ],
    }
    with provider(OrderDraft=reading):
        response = await client.post(path)
    assert response.status_code == 200
    return path, response.json()


async def confirmed_judge_order(client: httpx.AsyncClient) -> dict[str, Any]:
    path, draft = await extracted_draft(client)
    response = await client.post(
        path + "/confirm", json={"revision": draft["revision"]}
    )
    response.raise_for_status()
    return next(
        item
        for item in await orders(client)
        if item["reference"] == response.json()["order_reference"]
    )


async def analysed_parcel(
    client: httpx.AsyncClient,
    order: dict[str, Any],
    *,
    cod: str = "1080",
    phone: str | None = "01X-EXAMPLE",
) -> httpx.Response:
    path = f"/api/judge/orders/{order['id']}/pack-checks"
    photo = await client.get(path + "/sample-photo?scenario=correct")
    photo.raise_for_status()
    fields = {
        "order_reference": order["label_reference"],
        "customer_name": "AI test recipient",
        "phone": phone,
        "cod_amount": cod,
        "address": "Example Road, Dhaka",
    }
    reading = {
        "fields": [
            {"field": key, "written": value, "legible": value is not None}
            for key, value in fields.items()
        ]
    }
    bags = {
        "lines": [
            {
                "line_number": i,
                "sku": sku,
                "verdict": "match",
                "reason": "The photographed colour and quantity match.",
            }
            for i, sku in enumerate(("DEMO-TOTE-R1", "DEMO-SHOULDER-R1"), 1)
        ]
    }
    with provider(BlindLabelReading=reading, VisibleBagComparison=bags):
        return await client.post(
            path,
            data={
                "expected_updated_at": order["updated_at"],
                "segmentation": "full_photo",
            },
            files={"photo": ("parcel.png", photo.content, "image/png")},
        )


async def test_judge_analysis_cannot_bypass_disabled_models(
    client: httpx.AsyncClient,
) -> None:
    client.cookies.clear()
    (await client.post("/api/judge/session")).raise_for_status()
    workspace = (await client.post("/api/judge/example", json={})).json()
    path = f"/api/judge/workspaces/{workspace['id']}/draft"
    response = await client.post(path + "?sample=true")
    assert response.status_code == 503
    assert (await client.get(path)).json() is None
    for order in await orders(client):
        assert order["pack_check"] is None
        assert order["status"] != "packed"


async def test_ai_draft_confirms_with_non_contactable_judge_phone(
    client: httpx.AsyncClient,
) -> None:
    path, draft = await extracted_draft(client)
    assert "sample" not in draft
    assert draft["content"]["customer_name"]["value"] == "AI test recipient"
    assert draft["content"]["phone"]["value"] == "01X-EXAMPLE"
    response = await client.post(
        path + "/confirm", json={"revision": draft["revision"]}
    )
    assert response.status_code == 200
    order = next(
        item
        for item in await orders(client)
        if item["reference"] == response.json()["order_reference"]
    )
    assert order["phone"] == "01X-EXAMPLE"
    assert order["status"] == "confirmed"
    assert Decimal(str(order["cod_amount"])) == Decimal("1080")


async def test_ai_mismatch_then_correction_books_same_order_once(
    client: httpx.AsyncClient,
) -> None:
    order = await confirmed_judge_order(client)
    path = f"/api/judge/orders/{order['id']}/pack-checks"
    response = await analysed_parcel(client, order, cod="1180")
    assert response.status_code == 201
    check = response.json()
    assert check["verdict"] == "fail"
    assert check["sam_path"]["label"]["path"] == "full_photo"
    assert "constructed" not in check
    failed_order = next(
        item for item in await orders(client) if item["id"] == order["id"]
    )
    response = await client.post(
        path + f"/{check['id']}/override",
        json={"expected_updated_at": failed_order["updated_at"]},
    )
    assert response.status_code == 409
    response = await analysed_parcel(client, failed_order)
    assert response.status_code == 201
    assert response.json()["verdict"] == "pass"
    packed = next(item for item in await orders(client) if item["id"] == order["id"])
    booking_path = f"/api/judge/orders/{order['id']}/booking"
    response = await client.post(
        booking_path, json={"expected_updated_at": packed["updated_at"]}
    )
    assert response.json()["state"] == "booked"
    assert response.json()["mode"] == "fake"
    await client.post(booking_path, json={"expected_updated_at": packed["updated_at"]})
    booked = next(item for item in await orders(client) if item["id"] == order["id"])
    assert booked["reference"] == order["reference"]
    stock = (await client.get("/api/judge/stock")).json()
    assert (
        next(item for item in stock if item["sku"] == "DEMO-TOTE-R1")["stock_qty"] == 0
    )


async def test_synthetic_photo_is_input_only_and_cannot_bypass_disabled_models(
    client: httpx.AsyncClient,
) -> None:
    order = await confirmed_judge_order(client)
    path = f"/api/judge/orders/{order['id']}/pack-checks"
    photo = await client.get(path + "/sample-photo?scenario=wrong-cod")
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/png"
    assert "attachment" in photo.headers["content-disposition"]
    assert (await client.get(path)).json() == []
    for fields in ({"sample_scenario": "pass"}, {}):
        response = await client.post(
            path,
            data={**fields, "expected_updated_at": order["updated_at"]},
            files={"photo": ("parcel.png", photo.content, "image/png")},
        )
        assert response.status_code == 503
    assert (await client.get(path)).json() == []


async def test_judge_starters_have_orders_and_payouts_from_today(
    client: httpx.AsyncClient,
) -> None:
    (await client.post("/api/judge/session")).raise_for_status()
    dhaka = timezone(timedelta(hours=6))
    today = now().astimezone(dhaka).date()
    assert any(
        order["status"] == "confirmed"
        and datetime.fromisoformat(order["created_at"]).astimezone(dhaka).date()
        == today
        for order in await orders(client)
    )
    payouts = (await client.get("/api/judge/payouts")).json()
    assert any(
        datetime.fromisoformat(payout["paid_at"]).astimezone(dhaka).date() == today
        for payout in payouts
    )


async def test_ai_unsure_requires_a_distinct_recorded_override(
    client: httpx.AsyncClient,
) -> None:
    order = await confirmed_judge_order(client)
    response = await analysed_parcel(client, order, phone=None)
    assert response.status_code == 201
    check = response.json()
    assert check["verdict"] == "unsure"
    assert check["override_by"] is None
    current = next(item for item in await orders(client) if item["id"] == order["id"])
    response = await client.post(
        f"/api/judge/orders/{order['id']}/booking",
        json={"expected_updated_at": current["updated_at"]},
    )
    assert response.status_code == 409
    response = await client.post(
        f"/api/judge/orders/{order['id']}/pack-checks/{check['id']}/override",
        json={"expected_updated_at": current["updated_at"]},
    )
    assert response.status_code == 200
    assert response.json()["verdict"] == "unsure"
    assert response.json()["override_by"] == "booking-check"


async def test_demo_phone_and_input_images_are_rejected_for_sellers(
    client: httpx.AsyncClient, engine: Engine
) -> None:
    (
        await client.post(
            "/api/seller/session", json={"passcode": "constructed-booking-check-only"}
        )
    ).raise_for_status()
    response = await client.post(
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
    draft = (await client.get(path)).json()
    response = await client.post(
        path + "/confirm", json={"revision": draft["revision"]}
    )
    assert response.status_code == 422
    assert "valid mobile number" in response.json()["detail"]
    await seed_seller_order(client, engine)
    response = await client.get(
        "/api/seller/orders/seller-example/pack-checks/sample-photo"
    )
    assert response.status_code == 403


async def test_reset_and_second_judge_cannot_affect_each_other_or_seller(
    client: httpx.AsyncClient, engine: Engine
) -> None:
    order = await confirmed_judge_order(client)
    seller_before = await seed_seller_order(client, engine)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://localhost:8000",
        headers={"x-pocketdokani-request": "1"},
    ) as second:
        (await second.post("/api/judge/session")).raise_for_status()
        second_orders = (await second.get("/api/judge/orders")).json()
        path = f"/api/judge/orders/{order['id']}/pack-checks"
        assert (await second.get(path)).status_code == 404
        response = await second.post(
            path, data={"expected_updated_at": order["updated_at"]}
        )
        assert response.status_code == 404
        assert (
            await client.post("/api/judge/example", json={"reset": True})
        ).status_code == 200
        assert (await second.get("/api/judge/orders")).json() == second_orders
        assert not any(item["id"] == order["id"] for item in await orders(client))
        assert (await client.get("/api/seller/orders")).json() == seller_before


async def test_reset_snapshot_allows_one_explicit_retry_and_rejects_replay(
    client: httpx.AsyncClient,
) -> None:
    workspaces = (await client.get("/api/judge/workspaces")).json()
    assert workspaces == []
    baseline: list[str] = []
    for _ in range(2):
        payload = {"reset": True, "expected_workspace_ids": baseline}
        response = await client.post("/api/judge/example", json=payload)
        assert response.status_code == 200
        current_id = response.json()["id"]
        assert current_id not in baseline
        before = await orders(client)
        response = await client.post("/api/judge/example", json=payload)
        assert response.status_code == 409
        assert (
            response.json()["detail"]
            == "The sample changed. Reload current state; reset was not repeated."
        )
        current = (await client.get("/api/judge/workspaces")).json()
        assert [workspace["id"] for workspace in current] == [current_id]
        assert await orders(client) == before
        baseline = [current_id]


async def test_repeated_and_concurrent_booking_keeps_one_consignment(
    client: httpx.AsyncClient, expected: str
) -> None:
    responses = await asyncio.gather(
        *[
            client.post(BOOKING_URL, json={"expected_updated_at": expected})
            for _ in range(2)
        ]
    )
    assert all(response.status_code in (200, 409) for response in responses)
    first = (await orders(client))[0]
    assert first["status"] == "booked"
    response = await client.post(BOOKING_URL, json={"expected_updated_at": expected})
    assert response.status_code == 200
    assert (await orders(client))[0]["consignment_id"] == first["consignment_id"]
    stock = (await client.get("/api/judge/stock")).json()
    assert stock[0]["stock_qty"] == 3


async def test_timeout_requires_invoice_lookup_before_retry(
    client: httpx.AsyncClient, expected: str
) -> None:
    response = await client.post(
        BOOKING_URL, json={"expected_updated_at": expected, "fake_scenario": "timeout"}
    )
    assert response.json()["state"] == "booking_unknown"
    stock = (await client.get("/api/judge/stock")).json()[0]
    assert (stock["stock_qty"], stock["available_qty"]) == (4, 3)
    # A blind retry reads the unresolved attempt without another courier create.
    response = await client.post(BOOKING_URL, json={"expected_updated_at": expected})
    assert response.json()["state"] == "booking_unknown"
    order = (await orders(client))[0]
    cancelled = await client.post(
        "/api/judge/orders/example-order/status",
        json={
            "status": "cancelled",
            "expected_status": "packed",
            "expected_updated_at": order["updated_at"],
        },
    )
    assert cancelled.status_code == 409
    response = await client.post(BOOKING_URL + "/reconcile", json={})
    assert response.json()["state"] == "not_found"
    response = await client.post(
        BOOKING_URL, json={"expected_updated_at": order["updated_at"]}
    )
    assert response.json()["state"] == "booked"
    stock = (await client.get("/api/judge/stock")).json()[0]
    assert stock["stock_qty"] == 3


async def test_late_success_is_recovered_and_return_restores_stock_once(
    client: httpx.AsyncClient, expected: str
) -> None:
    response = await client.post(
        BOOKING_URL,
        json={"expected_updated_at": expected, "fake_scenario": "late_success"},
    )
    assert response.json()["state"] == "booking_unknown"
    # A new HTTP client models reconnecting after the lost response.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://localhost:8000",
        headers={"x-pocketdokani-request": "1"},
        cookies={"pd_judge": "constructed-booking-session"},
    ) as reconnected:
        response = await reconnected.post(BOOKING_URL + "/reconcile", json={})
        assert response.json()["state"] == "booked"
    booked = (await orders(client))[0]
    again = await client.post(BOOKING_URL + "/reconcile", json={})
    assert again.json()["state"] == "booked"
    assert (await orders(client))[0]["consignment_id"] == booked["consignment_id"]
    payload = {
        "status": "returned",
        "expected_status": "booked",
        "expected_updated_at": booked["updated_at"],
    }
    response = await client.post("/api/judge/orders/example-order/status", json=payload)
    assert response.status_code == 200
    response = await client.post("/api/judge/orders/example-order/status", json=payload)
    assert response.status_code == 409
    stock = (await client.get("/api/judge/stock")).json()[0]
    assert stock["stock_qty"] == 4


async def test_duplicate_invoice_adopts_existing_consignment(
    client: httpx.AsyncClient, expected: str
) -> None:
    response = await client.post(
        BOOKING_URL,
        json={"expected_updated_at": expected, "fake_scenario": "duplicate"},
    )
    assert response.json()["state"] == "booked"
    stock = (await client.get("/api/judge/stock")).json()[0]
    assert stock["stock_qty"] == 3
