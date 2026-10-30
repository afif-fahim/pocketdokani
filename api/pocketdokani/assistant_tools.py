"""Closed, shop-scoped assistant tools. Proposal tools perform no business writes."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from pocketdokani.business import orders_payload, payouts_payload, stock_payload
from pocketdokani.db import now
from pocketdokani.drafting import DraftValues
from pocketdokani.order_actions import STATUS_TRANSITIONS
from pocketdokani.records import BrowserSession, identifier


class Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class DateRange(Arguments):
    start: date
    end: date


class SearchOrders(Arguments):
    status: (
        Literal[
            "draft",
            "confirmed",
            "packed",
            "booked",
            "delivered",
            "returned",
            "cancelled",
            "awaiting_dispatch",
        ]
        | None
    ) = None
    date_range: DateRange | None = None
    customer: str | None = Field(default=None, max_length=160)


class GetOrder(Arguments):
    reference: str = Field(min_length=1, max_length=40)


class StockSummary(Arguments):
    sku: str | None = Field(default=None, max_length=80)


class SalesSummary(Arguments):
    period: Literal["today", "this_week", "this_month", "all_time"]


class FindProduct(Arguments):
    text: str = Field(min_length=1, max_length=160)


class ProposeStatus(GetOrder):
    status: Literal["delivered", "returned", "cancelled"]


class ProposeDraft(Arguments):
    values: DraftValues


TOOLS: dict[str, tuple[type[BaseModel], str]] = {
    "search_orders": (
        SearchOrders,
        "Search orders. awaiting_dispatch means confirmed or packed. Dates are inclusive Asia/Dhaka calendar dates. Results include an exact total count and record chips.",
    ),
    "get_order": (
        GetOrder,
        "Look up an exact PocketDokani order reference in this shop.",
    ),
    "stock_summary": (
        StockSummary,
        "Get stock by exact SKU, or all stock. Find products first when the user gives a product name. In-transit stock has zero available quantity.",
    ),
    "sales_summary": (
        SalesSummary,
        "Order value (lines plus delivery, before prior payments), excluding draft, returned and cancelled orders. Weeks begin Saturday, Asia/Dhaka.",
    ),
    "payout_summary": (
        Arguments,
        "Recorded payouts and delivered COD. Fees and payout due are unknown; never infer them.",
    ),
    "find_product": (
        FindProduct,
        "Search product name, variant and SKU using all space-separated words. Returns stock quantities and matching SKU chips.",
    ),
    "propose_order_draft": (
        ProposeDraft,
        "Propose creation of an unconfirmed draft only. Use explicitly requested details; unknown fields are null. Never use list prices as negotiated prices. Prior payment cannot be set. Seller must confirm the card, then review the draft separately.",
    ),
    "propose_status": (
        ProposeStatus,
        "Propose a status change only. Booked orders may become delivered or returned; draft/confirmed/packed may be cancelled. Nothing changes until the seller confirms the card.",
    ),
}


def tool_definitions() -> list[dict[str, object]]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": model.model_json_schema(),
            },
        }
        for name, (model, description) in TOOLS.items()
    ]


def order_chip(order: dict[str, Any]) -> dict[str, object]:
    return {
        "kind": "order",
        "key": order["id"],
        "label": order["reference"],
        "section": "orders",
    }


def stock_chip(sku: dict[str, Any]) -> dict[str, object]:
    return {"kind": "sku", "key": sku["sku"], "label": sku["sku"], "section": "stock"}


def order_results(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "records": [order_chip(row) for row in rows],
        "metrics": {"order_count": len(rows)},
        "data": rows,
    }


def stock_results(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "records": [stock_chip(row) for row in rows],
        "metrics": {
            "available_quantity": sum(row["available_qty"] for row in rows),
            "remaining_quantity": sum(row["stock_qty"] for row in rows),
        },
        "data": rows,
    }


def execute_tool(
    db: Session, actor: BrowserSession, name: str, raw: str
) -> dict[str, Any]:
    if name not in TOOLS:
        return {"error": "Unknown tool."}
    # JSON mode accepts ISO date strings, while forbidding extra owner/context arguments.
    args = TOOLS[name][0].model_validate_json(raw)
    if isinstance(args, ProposeDraft):
        return {
            "proposal": {
                "kind": "order_draft",
                "request_id": identifier(),
                "values": args.values.model_dump(),
                "label": "Create draft for seller review",
            }
        }
    if isinstance(args, (GetOrder, SearchOrders, SalesSummary)):
        orders: list[dict[str, Any]] = orders_payload(db, actor)
        if isinstance(args, GetOrder):
            orders = [row for row in orders if row["reference"] == args.reference]
            if isinstance(args, ProposeStatus):
                if not orders:
                    return {"error": "Order not found in this shop."}
                order = orders[0]
                if args.status not in STATUS_TRANSITIONS.get(str(order["status"]), ()):
                    return {"error": "That status transition is not available."}
                return {
                    **order_results(orders),
                    "proposal": {
                        "kind": "status",
                        "order_id": order["id"],
                        "reference": order["reference"],
                        "status": args.status,
                        "expected_status": order["status"],
                        "expected_updated_at": order["updated_at"],
                        "label": f"{order['reference']}: {order['status']} → {args.status}",
                    },
                }
        elif isinstance(args, SearchOrders):
            if args.status:
                states = (
                    ("confirmed", "packed")
                    if args.status == "awaiting_dispatch"
                    else (args.status,)
                )
                orders = [row for row in orders if row["status"] in states]
            if args.customer:
                orders = [
                    row
                    for row in orders
                    if args.customer.casefold()
                    in str(row["customer_name"] or "").casefold()
                ]
            if args.date_range:
                if args.date_range.start > args.date_range.end:
                    return {"error": "The start date must be before the end date."}
                orders = [
                    row
                    for row in orders
                    if args.date_range.start
                    <= datetime.fromisoformat(str(row["created_at"]))
                    .astimezone(ZoneInfo("Asia/Dhaka"))
                    .date()
                    <= args.date_range.end
                ]
        else:
            today = now().astimezone(ZoneInfo("Asia/Dhaka")).date()
            start = {
                "today": today,
                "this_week": today - timedelta(days=(today.weekday() + 2) % 7),
                "this_month": today.replace(day=1),
                "all_time": date.min,
            }[args.period]
            orders = [
                row
                for row in orders
                if row["status"] in ("confirmed", "packed", "booked", "delivered")
                and start
                <= datetime.fromisoformat(str(row["created_at"]))
                .astimezone(ZoneInfo("Asia/Dhaka"))
                .date()
                <= today
            ]
            total = sum(
                (
                    sum(
                        (Decimal(line["line_total"]) for line in row["lines"]),
                        Decimal(0),
                    )
                    + Decimal(str(row["customer_delivery_charge"]))
                    for row in orders
                ),
                Decimal(0),
            )
            result = order_results(orders)
            result["metrics"]["order_value_bdt"] = str(total)
            result["period"] = args.period
            return result
        return order_results(orders)
    if isinstance(args, (StockSummary, FindProduct)):
        stock = stock_payload(db, actor)
        if isinstance(args, FindProduct):
            words = args.text.casefold().split()
            stock = [
                row
                for row in stock
                if all(
                    word
                    in f"{row['product_name']} {row['variant']} {row['sku']}".casefold()
                    for word in words
                )
            ]
        elif args.sku:
            stock = [row for row in stock if row["sku"] == args.sku]
        return stock_results(stock)
    payouts = payouts_payload(db, actor)
    delivered = [
        row for row in orders_payload(db, actor) if row["status"] == "delivered"
    ]
    return {
        "records": [
            {
                "kind": "payout",
                "key": row["statement"],
                "label": row["statement"],
                "section": "orders",
            }
            for row in payouts
        ]
        + [order_chip(row) for row in delivered],
        "metrics": {
            "recorded_payout_bdt": str(
                sum((Decimal(str(row["amount"])) for row in payouts), Decimal(0))
            ),
            "delivered_cod_bdt": str(
                sum((Decimal(str(row["cod_amount"])) for row in delivered), Decimal(0))
            ),
        },
        "payout_due": None,
        "note": "Courier fees are not stored. Payout due and unexplained gaps are unknown.",
        "data": payouts,
    }
