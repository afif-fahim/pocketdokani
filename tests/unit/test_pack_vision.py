"""Region phrase fallback and label re-read, with the provider boundary substituted."""

import io
import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image
from pocketdokani.features.conversations.imports import Original
from pocketdokani.features.packing import pack_vision
from pocketdokani.features.packing.pack_vision import LABEL_FIELDS, analyse_pack
from sqlalchemy.orm import Session

ACTOR = cast(Any, SimpleNamespace())
DB = cast(Session, None)


def photo() -> Original:
    buffer = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(buffer, "PNG")
    return Original("parcel.png", buffer.getvalue(), "image/png", 200, 100)


def label_reply(*, legible: bool) -> dict[str, Any]:
    fields = [
        {"field": field, "written": "x" if legible else None, "legible": legible}
        for field in LABEL_FIELDS
    ]
    return {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"content": json.dumps({"fields": fields})},
            }
        ]
    }


@pytest.fixture
def sam_finds(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, list[str]]]:
    """Map each phrase that yields a crop; record every phrase requested."""
    found = {"phrases": ["paper label", "handbag"], "asked": []}

    def crop(
        _db: Session,
        _actor: Any,
        _image: Image.Image,
        _url: str,
        _check: str,
        _region: str,
        phrase: str,
    ) -> tuple[bytes | None, dict[str, str]]:
        found["asked"].append(phrase)
        if phrase in found["phrases"]:
            return phrase.encode(), {"path": "crop", "reason": phrase}
        return None, {"path": "full_photo", "reason": "SAM found no usable region."}

    monkeypatch.setattr(pack_vision, "_crop", crop)
    yield found


@pytest.fixture
def label_reads(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Queue label replies; each model call consumes one and records its image."""
    queue: list[dict[str, Any]] = []
    seen: list[dict[str, Any]] = []

    def call(*_args: Any, **kwargs: Any) -> dict[str, Any]:
        seen.append(kwargs["json"]["messages"][1]["content"][0]["image_url"]["url"])
        return queue.pop(0)

    monkeypatch.setattr(pack_vision, "model_call", call)
    return_value: Any = SimpleNamespace(queue=queue, seen=seen)
    return return_value


def test_stops_at_first_phrase_with_a_crop(
    sam_finds: dict[str, list[str]], label_reads: Any
) -> None:
    label_reads.queue.append(label_reply(legible=True))
    analysis = analyse_pack(DB, ACTOR, photo(), "check", [])
    assert sam_finds["asked"] == ["paper label", "handbag"]
    assert analysis["sam_path"]["label"]["path"] == "crop"


def test_falls_through_phrases_then_full_photo(
    sam_finds: dict[str, list[str]], label_reads: Any
) -> None:
    sam_finds["phrases"][:] = ["bag"]
    label_reads.queue.append(label_reply(legible=True))
    analysis = analyse_pack(DB, ACTOR, photo(), "check", [])
    assert sam_finds["asked"] == ["paper label", "paper", "handbag", "bag"]
    assert analysis["crops"]["label"] is None
    assert analysis["sam_path"]["label"]["path"] == "full_photo"
    assert analysis["crops"]["bag"] == b"bag"


def test_full_photo_mode_skips_sam(
    sam_finds: dict[str, list[str]], label_reads: Any
) -> None:
    label_reads.queue.append(label_reply(legible=True))
    analyse_pack(DB, ACTOR, photo(), "check", [], "full_photo")
    assert sam_finds["asked"] == []


def test_readable_label_is_read_once(
    sam_finds: dict[str, list[str]], label_reads: Any
) -> None:
    label_reads.queue.append(label_reply(legible=True))
    analyse_pack(DB, ACTOR, photo(), "check", [])
    assert len(label_reads.seen) == 1


def test_all_illegible_is_reread_once_on_the_full_photo(
    sam_finds: dict[str, list[str]], label_reads: Any
) -> None:
    label_reads.queue.extend([label_reply(legible=False), label_reply(legible=True)])
    analysis = analyse_pack(DB, ACTOR, photo(), "check", [])
    crop_image, full_image = label_reads.seen
    assert crop_image != full_image
    assert all(field["legible"] for field in analysis["reading"]["fields"])


def test_still_illegible_after_reread_stays_illegible(
    sam_finds: dict[str, list[str]], label_reads: Any
) -> None:
    label_reads.queue.extend([label_reply(legible=False), label_reply(legible=False)])
    analysis = analyse_pack(DB, ACTOR, photo(), "check", [])
    assert len(label_reads.seen) == 2
    assert not any(field["legible"] for field in analysis["reading"]["fields"])
