"""Only the records needed for persistent screenshot imports."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "browser_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("context", sa.String(10), nullable=False),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("context IN ('seller', 'judge')"),
    )
    op.create_index("ix_browser_sessions_owner", "browser_sessions", ["owner"])
    op.create_table(
        "request_budgets",
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("used", sa.Integer(), nullable=False),
        sa.Column("resets_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reference", sa.String(40), nullable=False, unique=True),
        sa.Column("context", sa.String(10), nullable=False),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("layout", sa.String(50), nullable=False),
        sa.Column("seller_side", sa.String(5), nullable=False),
        sa.Column("confirmed_by", sa.String(64), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("context IN ('seller', 'judge')"),
        sa.CheckConstraint("seller_side IN ('left', 'right')"),
    )
    op.create_index("ix_workspaces_owner", "workspaces", ["owner"])
    op.create_table(
        "source_images",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(160), nullable=False),
        sa.Column("storage_key", sa.String(200), nullable=False, unique=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("media_type", sa.String(30), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.UniqueConstraint("workspace_id", "sequence"),
    )
    op.create_index("ix_source_images_workspace_id", "source_images", ["workspace_id"])
    op.create_table(
        "skus",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("sku", sa.String(80), primary_key=True),
        sa.Column("product_name", sa.String(160), nullable=False),
        sa.Column("variant", sa.String(80), nullable=False),
        sa.Column("lot", sa.String(80), nullable=False),
        sa.Column("lot_received", sa.Boolean(), nullable=False),
        sa.Column("constructed", sa.Boolean(), nullable=False),
        sa.Column("reviewed_by", sa.String(100), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        # Supabase may grant public-schema tables to Data API roles by default.
        # Only the migration/table-owner connection used by FastAPI may access
        # these records. No anonymous/authenticated client policies are created.
        for table in (
            "browser_sessions",
            "request_budgets",
            "workspaces",
            "source_images",
            "skus",
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
    for table in (
        "skus",
        "source_images",
        "workspaces",
        "request_budgets",
        "browser_sessions",
    ):
        op.drop_table(table)
