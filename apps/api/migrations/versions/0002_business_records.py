"""Business records and owner-scoped catalogue photos."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("product_id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("photo_key", sa.String(200)),
        sa.Column("photo_media_type", sa.String(30)),
    )
    # Batch mode also supports SQLite's development-only ALTER TABLE limitations.
    with op.batch_alter_table("skus") as batch:
        batch.add_column(sa.Column("product_id", sa.String(80)))
        batch.add_column(
            sa.Column(
                "unit_cost", sa.Numeric(14, 2), nullable=False, server_default="0"
            )
        )
        batch.add_column(
            sa.Column(
                "list_price", sa.Numeric(14, 2), nullable=False, server_default="0"
            )
        )
        batch.add_column(
            sa.Column("stock_qty", sa.Integer(), nullable=False, server_default="0")
        )
        batch.create_foreign_key(
            "fk_skus_product",
            "products",
            ["owner", "product_id"],
            ["owner", "product_id"],
        )
        batch.create_check_constraint(
            "ck_skus_amounts", "unit_cost >= 0 AND list_price >= 0 AND stock_qty >= 0"
        )
    op.create_table(
        "orders",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reference", sa.String(40), nullable=False),
        sa.Column("source_id", sa.String(100)),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("customer_name", sa.String(160)),
        sa.Column("phone", sa.String(40)),
        sa.Column("address", sa.Text()),
        sa.Column("customer_delivery_charge", sa.Numeric(14, 2), nullable=False),
        sa.Column("verified_prior_payment", sa.Numeric(14, 2), nullable=False),
        sa.Column("cod_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("consignment_id", sa.String(100)),
        sa.Column("tracking_code", sa.String(100)),
        sa.Column(
            "source_workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="SET NULL"),
        ),
        sa.Column("payout_source_id", sa.String(100)),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner", "reference"),
        sa.UniqueConstraint("owner", "source_id"),
        sa.CheckConstraint(
            "status IN ('draft', 'confirmed', 'packed', 'booked', 'delivered', 'returned', 'cancelled')"
        ),
        sa.CheckConstraint(
            "customer_delivery_charge >= 0 AND verified_prior_payment >= 0 AND cod_amount >= 0"
        ),
    )
    op.create_table(
        "order_lines",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("order_id", sa.String(36), primary_key=True),
        sa.Column("line_number", sa.Integer(), primary_key=True),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("line_discount", sa.Numeric(14, 2), nullable=False),
        sa.Column("source_quote", sa.Text()),
        sa.ForeignKeyConstraint(["owner", "order_id"], ["orders.owner", "orders.id"]),
        sa.ForeignKeyConstraint(["owner", "sku"], ["skus.owner", "skus.sku"]),
        sa.CheckConstraint("quantity > 0 AND unit_price >= 0 AND line_discount >= 0"),
        sa.CheckConstraint("line_discount <= quantity * unit_price"),
    )
    op.create_table(
        "payouts",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("source_id", sa.String(100), primary_key=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.CheckConstraint("amount >= 0"),
    )
    op.create_table(
        "business_imports",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_by", sa.String(100), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        for table in (
            "products",
            "orders",
            "order_lines",
            "payouts",
            "business_imports",
        ):
            op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
            op.execute(f'REVOKE ALL ON TABLE "{table}" FROM PUBLIC')
            for role in ("anon", "authenticated"):
                op.execute(f"""DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                        REVOKE ALL ON TABLE "{table}" FROM "{role}";
                    END IF;
                END $$""")


def downgrade() -> None:
    for table in ("business_imports", "payouts", "order_lines", "orders"):
        op.drop_table(table)
    with op.batch_alter_table("skus") as batch:
        batch.drop_constraint("ck_skus_amounts", type_="check")
        batch.drop_constraint("fk_skus_product", type_="foreignkey")
        for name in ("stock_qty", "list_price", "unit_cost", "product_id"):
            batch.drop_column(name)
    op.drop_table("products")
