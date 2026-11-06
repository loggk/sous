"""pgvector hnsw index

Revision ID: 0004_pgvector_hnsw_index
Revises: 0003_company_tenancy
Create Date: 2026-11-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0004_pgvector_hnsw_index'
down_revision = '0003_company_tenancy'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Build HNSW index on canonical_items.embedding for fast cosine distance (<=>)
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS idx_canonical_items_embedding_hnsw
            ON canonical_items
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DROP INDEX IF EXISTS idx_canonical_items_embedding_hnsw;
            """
        )
    )
