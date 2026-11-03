"""Retire judge sessions that could contain preloaded analysis results."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sessions = sa.table("browser_sessions", sa.column("context", sa.String()))
    op.execute(sessions.delete().where(sessions.c.context == "judge"))


def downgrade() -> None:
    # Revoked session credentials cannot be safely recreated.
    pass
