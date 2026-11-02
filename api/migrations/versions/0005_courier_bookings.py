"""Durable booking attempts, stock holds and the isolated fake courier."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "courier_bookings",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("order_id", sa.String(36), primary_key=True),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("attempt_id", sa.String(36), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("quantities", sa.JSON(), nullable=False),
        sa.Column("responses", sa.JSON(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner", "order_id"], ["orders.owner", "orders.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint("mode IN ('fake', 'live')"),
        sa.CheckConstraint(
            "state IN ('in_progress', 'booking_unknown', 'not_found', 'rejected', 'booked')"
        ),
    )
    op.create_table(
        "fake_consignments",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("invoice", sa.String(100), primary_key=True),
        sa.Column("consignment_id", sa.String(100), nullable=False, unique=True),
        sa.Column("tracking_code", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        for table in ("courier_bookings", "fake_consignments"):
            op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
            op.execute(f'REVOKE ALL ON TABLE "{table}" FROM PUBLIC')
            for role in ("anon", "authenticated"):
                op.execute(f"""DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                        REVOKE ALL ON TABLE "{table}" FROM "{role}";
                    END IF;
                END $$""")


def downgrade() -> None:
    op.drop_table("fake_consignments")
    op.drop_table("courier_bookings")
