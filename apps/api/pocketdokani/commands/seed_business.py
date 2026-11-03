"""Upsert seller-reviewed business records from an ignored local workbook."""

import argparse
import subprocess
from pathlib import Path

from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from pocketdokani.commands.workbook import BusinessData, read_workbook
from pocketdokani.data.db import engine, now
from pocketdokani.data.records import BusinessImport, OrderLine
from pocketdokani.data.storage import ObjectStorage
from pocketdokani.features.conversations.imports import cleanup_objects


def import_business(db: Session, data: BusinessData, reviewed_by: str) -> bool:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(73012002)"))
    prior = db.get(BusinessImport, "shop")
    if prior is not None and prior.sha256 == data.sha256:
        return False
    storage = ObjectStorage()
    uploaded: list[str] = []
    try:
        for key, photo in data.photos.items():
            existing = storage.get_if_exists(key)
            if existing is None:
                storage.put(key, photo, "image/webp")
                uploaded.append(key)
            elif existing != photo:
                raise ValueError(
                    "Stored product photo does not match its content hash."
                )
        for records in (data.products, data.skus, data.orders):
            for record in records:
                db.merge(record)
            db.flush()
        for order in data.orders:
            db.execute(
                delete(OrderLine).where(
                    OrderLine.owner == "shop", OrderLine.order_id == order.id
                )
            )
        for line in data.lines:
            db.add(line)
        for payout in data.payouts:
            db.merge(payout)
        db.merge(
            BusinessImport(
                owner="shop",
                sha256=data.sha256,
                imported_at=now(),
                reviewed_by=reviewed_by,
            )
        )
    except Exception:
        db.rollback()
        cleanup_objects(uploaded)
        raise
    # A connection can fail after COMMIT has reached the database. Preserve the
    # photos on that ambiguous outcome; an orphan sweep can remove unused keys.
    db.commit()
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--reviewed-by", required=True)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and report counts without writes.",
    )
    args = parser.parse_args()
    if not 1 <= len(args.reviewed_by.strip()) <= 100:
        parser.error("Supply a reviewer identifier of 1–100 characters.")
    try:
        root = Path(
            subprocess.check_output(
                [
                    "git",
                    "-C",
                    str(Path(__file__).resolve().parent),
                    "rev-parse",
                    "--show-toplevel",
                ],
                encoding="utf-8",
                stderr=subprocess.DEVNULL,
            ).strip()
        ).resolve()
    except (OSError, subprocess.CalledProcessError):
        parser.error("Run this command using the repository checkout.")
    try:
        relative = args.file.resolve().relative_to(root)
    except ValueError:
        parser.error("Use an ignored local .xlsx path inside this repository.")
    try:
        ignored = subprocess.run(
            ["git", "check-ignore", "-q", "--", relative.as_posix()],
            cwd=root,
            check=False,
        )
        if ignored.returncode != 0 or args.file.suffix.lower() != ".xlsx":
            parser.error("Use an ignored local .xlsx path inside this repository.")
        data = read_workbook(args.file, args.reviewed_by.strip())
    except ValueError as error:
        # read_workbook's errors contain locations, never source values.
        parser.error(str(error))
    except Exception:
        parser.error("Could not read the private workbook. Check its path and format.")
    counts = ", ".join(f"{count} {name}" for name, count in data.counts().items())
    if args.dry_run:
        print(f"Validated: {counts}. No records or photos written.")
        return
    try:
        with Session(engine) as db:
            changed = import_business(db, data, args.reviewed_by.strip())
    except Exception:
        parser.exit(
            1,
            "Import did not complete cleanly. Check migrations and private storage, then re-run. No source values logged.\n",
        )
    print(f"{'Imported' if changed else 'Unchanged workbook; no writes'}: {counts}.")


if __name__ == "__main__":
    main()
