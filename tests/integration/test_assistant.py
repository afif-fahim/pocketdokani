"""Assistant answers for empty results, with only the Meta HTTP boundary substituted."""

import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest
from pocketdokani.core.config import settings
from pydantic import SecretStr

UNKNOWN = "I don't know. That information isn't in your records."


def tool_call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    return {
        "finish_reason": "tool_calls",
        "message": {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "call-1",
                    "type": "function",
                    "function": {"name": name, "arguments": json.dumps(arguments)},
                }
            ],
        },
    }


def final(metric: str) -> dict[str, Any]:
    content = {"citations": ["T1"], "metrics": [{"result_id": "T1", "metric": metric}]}
    return {
        "finish_reason": "stop",
        "message": {"role": "assistant", "content": json.dumps(content)},
    }


@contextmanager
def provider(*choices: dict[str, Any]) -> Iterator[None]:
    queue = list(choices)
    config = settings()
    client_type = httpx.Client

    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [queue.pop(0)]})

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(config, "model_calls_enabled", True)
        monkeypatch.setattr(config, "model_api_key", SecretStr("synthetic-check"))
        monkeypatch.setattr(
            httpx,
            "Client",
            lambda **kwargs: client_type(
                transport=httpx.MockTransport(respond), **kwargs
            ),
        )
        yield


async def ask(client: httpx.AsyncClient, question: str) -> dict[str, Any]:
    response = await client.post(
        "/api/judge/assistant/turns", json={"transcript": question}
    )
    response.raise_for_status()
    return response.json()


async def test_order_search_with_no_matches_answers_zero(
    client: httpx.AsyncClient,
) -> None:
    with provider(
        tool_call("search_orders", {"status": "returned"}), final("order_count")
    ):
        body = await ask(client, "How many orders were returned?")
    assert body["answer"] == "Orders: 0"
    assert body["incomplete"] is False


async def test_unknown_product_stays_unknown_rather_than_zero_stock(
    client: httpx.AsyncClient,
) -> None:
    with provider(
        tool_call("find_product", {"text": "Nonexistent"}),
        final("available_quantity"),
    ):
        body = await ask(client, "How many nonexistent bags do I have?")
    assert body["answer"] == UNKNOWN
