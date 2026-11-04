"""Function-scoped API fixtures using synthetic records and temporary storage."""

from collections.abc import AsyncIterator, Iterator
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from pocketdokani.core.config import settings
from pocketdokani.core.security import digest
from pocketdokani.data.db import Base, database, now
from pocketdokani.data.records import BrowserSession, Order, OrderLine, PackCheck, Sku
from pocketdokani.main import app
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session


@pytest.fixture
def engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Engine]:
    monkeypatch.setattr(settings(), "local_storage_path", tmp_path / "objects")
    test_engine = create_engine(
        f"sqlite:///{tmp_path / 'booking.db'}", connect_args={"timeout": 15}
    )
    try:
        Base.metadata.create_all(test_engine)

        def test_database() -> Iterator[Session]:
            with Session(test_engine, expire_on_commit=False) as db:
                yield db

        monkeypatch.setitem(app.dependency_overrides, database, test_database)
        timestamp = now()
        with Session(test_engine) as db:
            db.add(
                BrowserSession(
                    token_hash=digest("constructed-booking-session"),
                    context="judge",
                    owner="booking-check",
                    expires_at=timestamp + timedelta(hours=1),
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
        yield test_engine
    finally:
        test_engine.dispose()


@pytest_asyncio.fixture
async def client(engine: Engine) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://localhost:8000",
        headers={"x-pocketdokani-request": "1"},
        cookies={"pd_judge": "constructed-booking-session"},
    ) as test_client:
        yield test_client


@pytest_asyncio.fixture
async def expected(client: httpx.AsyncClient) -> str:
    response = await client.get("/api/judge/orders")
    response.raise_for_status()
    return response.json()[0]["updated_at"]
