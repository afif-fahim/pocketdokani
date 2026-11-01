"""Typed handoff from parcel-photo analysis to private check persistence."""

from typing import Literal, TypedDict

SegmentationMode = Literal["sam", "full_photo"]


class PackAnalysis(TypedDict):
    reading: dict[str, object]
    bag_results: list[dict[str, object]]
    sam_path: dict[str, dict[str, str]]
    crops: dict[str, bytes | None]
