"""Load only seller-reviewed catalogue data, from an ignored JSON file."""

import argparse
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from pocketdokani.data.db import engine, now
from pocketdokani.data.records import Sku


class ReviewedSku(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    sku: str = Field(min_length=1, max_length=80)
    product_name: str = Field(min_length=1, max_length=160)
    variant: str = Field(min_length=1, max_length=80)
    lot: str = Field(min_length=1, max_length=80)
    lot_received: bool


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--reviewed-by", required=True)
    args = parser.parse_args()
    if not 1 <= len(args.reviewed_by) <= 100:
        parser.error("Supply a reviewer identifier of 1–100 characters.")
    try:
        rows = TypeAdapter(list[ReviewedSku]).validate_json(
            args.file.read_text(encoding="utf-8")
        )
    except (OSError, ValidationError):
        parser.error("Could not read reviewed SKU JSON. Check the documented schema.")
    if len({row.sku for row in rows}) != len(rows):
        parser.error("SKU identifiers must be unique, including lot-specific variants.")
    with Session(engine) as db:
        for row in rows:
            db.merge(
                Sku(
                    owner="shop",
                    **row.model_dump(),
                    constructed=False,
                    reviewed_by=args.reviewed_by,
                    reviewed_at=now(),
                )
            )
        db.commit()
    print(f"Loaded {len(rows)} reviewed shop SKUs. Judge catalogue unchanged.")


if __name__ == "__main__":
    main()
