"""Bounded Meta calls, charged and audited per attempt, including failures."""

import time
from collections.abc import Callable
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from pocketdokani.core.config import settings
from pocketdokani.core.security import budget
from pocketdokani.data.records import BrowserSession, ModelRun


class PreWriteModelError(HTTPException):
    """Model failure before business writes; audit/budget records may be saved."""


def require_models() -> None:
    config = settings()
    if not config.model_calls_enabled or not config.model_api_key.get_secret_value():
        raise PreWriteModelError(
            503, "Model calls are disabled. Ask the shop owner to configure the server."
        )


def model_call(
    db: Session,
    actor: BrowserSession,
    kind: str,
    model: str,
    refs: dict[str, object],
    path: str,
    response_decoder: Callable[[httpx.Response], dict[str, Any]] | None = None,
    **payload: Any,
) -> dict[str, Any]:
    require_models()
    config = settings()
    maximum = (
        config.judge_model_calls_per_hour
        if actor.context == "judge"
        else config.seller_model_calls_per_hour
    )
    for attempt in range(2):
        budget(db, "model:" + actor.owner, maximum)
        run = ModelRun(
            owner=actor.owner,
            kind=kind,
            model=model,
            input_refs=refs,
            output={"status": "started"},
            tokens={},
            latency_ms=0,
        )
        db.add(run)
        db.commit()
        started = time.monotonic()
        retryable = False
        result: dict[str, Any] | None = None
        try:
            with httpx.Client(timeout=httpx.Timeout(45, connect=10)) as client:
                request_headers = {
                    "Authorization": "Bearer "
                    + config.model_api_key.get_secret_value(),
                    "Accept": "text/event-stream"
                    if response_decoder
                    else "application/json",
                }
                if response_decoder:
                    with client.stream(
                        "POST",
                        "https://api.meta.ai/v1/" + path,
                        headers=request_headers,
                        **payload,
                    ) as response:
                        retryable = (
                            response.status_code == 429 or response.status_code >= 500
                        )
                        response.raise_for_status()
                        body = response_decoder(response)
                else:
                    response = client.post(
                        "https://api.meta.ai/v1/" + path,
                        headers=request_headers,
                        **payload,
                    )
                    retryable = (
                        response.status_code == 429 or response.status_code >= 500
                    )
                    response.raise_for_status()
                    body = response.json()
            if not isinstance(body, dict):
                raise ValueError("Invalid response")
            result = body
            run.output = body
            usage = body.get("usage", {})
            run.tokens = usage if isinstance(usage, dict) else {}
        except (httpx.HTTPError, ValueError) as error:
            retryable = retryable or isinstance(error, httpx.TransportError)
            # Never store provider error bodies: they can echo credentials/URLs.
            run.output = {"status": "failed", "reason": type(error).__name__}
        finally:
            run.latency_ms = round((time.monotonic() - started) * 1000)
            db.commit()
        if result is not None:
            return result
        if not retryable or attempt == 1:
            break
        time.sleep(0.5)
    raise PreWriteModelError(
        502,
        "The model could not complete the request. Your saved work is unchanged; try again.",
    )
