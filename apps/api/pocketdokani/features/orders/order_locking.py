"""Keep order mutations in the same draft-before-order lock sequence."""

from datetime import datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from pocketdokani.data.records import OrderDraft


def bump_order_draft_revision(
    db: Session, owner: str, order_id: str, timestamp: datetime
) -> None:
    # Claim the linked draft before changing Order. Historical orders may have
    # no draft. Draft saves instead compare their expected revision explicitly.
    db.execute(
        update(OrderDraft)
        .where(OrderDraft.owner == owner, OrderDraft.order_id == order_id)
        .values(revision=OrderDraft.revision + 1, updated_at=timestamp)
    )
