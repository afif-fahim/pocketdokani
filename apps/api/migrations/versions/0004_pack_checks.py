"""Private pack-check evidence and current packing authorization."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("active_pack_check_id", sa.String(36)))
    op.create_table(
        "pack_checks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner", sa.String(64), nullable=False, index=True),
        sa.Column("order_id", sa.String(36), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("order_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("photo_key", sa.String(200), nullable=False, unique=True),
        sa.Column("photo_media_type", sa.String(30), nullable=False),
        sa.Column("photo_sha256", sa.String(64), nullable=False),
        sa.Column("crop_keys", sa.JSON(), nullable=False),
        sa.Column("sam_path", sa.JSON(), nullable=False),
        sa.Column("reading", sa.JSON(), nullable=False),
        sa.Column("reasons", sa.JSON(), nullable=False),
        sa.Column("bag_results", sa.JSON(), nullable=False),
        sa.Column("verdict", sa.String(10), nullable=False),
        sa.Column("label_verdict", sa.String(10), nullable=False),
        sa.Column("bag_verdict", sa.String(10), nullable=False),
        sa.Column("override_by", sa.String(64)),
        sa.Column("override_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["owner", "order_id"], ["orders.owner", "orders.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint("verdict IN ('pass', 'fail', 'unsure')"),
        sa.CheckConstraint("label_verdict IN ('pass', 'fail', 'unsure')"),
        sa.CheckConstraint("bag_verdict IN ('match', 'mismatch', 'unsure')"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute('ALTER TABLE "pack_checks" ENABLE ROW LEVEL SECURITY')
        op.execute('REVOKE ALL ON TABLE "pack_checks" FROM PUBLIC')
        for role in ("anon", "authenticated"):
            op.execute(f"""DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                    REVOKE ALL ON TABLE "pack_checks" FROM "{role}";
                END IF;
            END $$""")


def downgrade() -> None:
    op.drop_table("pack_checks")
    op.drop_column("orders", "active_pack_check_id")
