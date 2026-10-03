"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2
import pgvector

# revision identifiers, used by Alembic.
revision = '0001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enable Required PostgreSQL Extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    op.execute('CREATE EXTENSION IF NOT EXISTS "postgis";')
    op.execute('CREATE EXTENSION IF NOT EXISTS "vector";')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm";')

    # 2. Restaurants Table
    op.create_table(
        'restaurants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('address', sa.String(length=500), nullable=True),
        sa.Column('geom', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326), nullable=True),
        sa.Column('seats', sa.Integer(), nullable=True),
        sa.Column('cuisine_type', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # 3. Users Table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), server_default='member', nullable=False),
    )
    op.create_index('idx_users_email', 'users', ['email'], unique=True)
    op.create_index('idx_users_restaurant_id', 'users', ['restaurant_id'])

    # 4. Suppliers Table
    op.create_table(
        'suppliers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('canonical_name', sa.String(length=255), nullable=False, unique=True),
        sa.Column('aliases', postgresql.ARRAY(sa.String()), server_default='{}', nullable=True),
        sa.Column('is_broadline', sa.Boolean(), server_default='false', nullable=False),
    )

    # 5. Documents Table
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('storage_key', sa.String(length=500), nullable=False),
        sa.Column('content_sha256', sa.String(length=64), nullable=False, unique=True),
        sa.Column('mime', sa.String(length=100), nullable=False),
        sa.Column('source_channel', sa.String(length=50), server_default='web_upload', nullable=False),
        sa.Column('status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_documents_restaurant_id', 'documents', ['restaurant_id'])
    op.create_index('idx_documents_sha256', 'documents', ['content_sha256'], unique=True)

    # 6. Invoices Table
    op.create_table(
        'invoices',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('invoice_number', sa.String(length=100), nullable=False),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('delivery_date', sa.Date(), nullable=True),
        sa.Column('subtotal', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('tax', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('total', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('extraction_provider', sa.String(length=50), nullable=True),
        sa.Column('extraction_version', sa.String(length=50), nullable=True),
        sa.Column('validation_status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('restaurant_id', 'supplier_id', 'invoice_number', name='uq_restaurant_supplier_invoice')
    )
    op.create_index('idx_invoices_restaurant_id', 'invoices', ['restaurant_id'])
    op.create_index('idx_invoices_invoice_date', 'invoices', ['invoice_date'])

    # 7. Canonical Items Table
    op.create_table(
        'canonical_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('name', sa.String(length=255), nullable=False, unique=True),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('base_unit', sa.String(length=20), nullable=False),
        sa.Column('benchmarkable', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('embedding', pgvector.sqlalchemy.Vector(768), nullable=True),
    )
    op.create_index('idx_canonical_items_category', 'canonical_items', ['category'])
    op.create_index('idx_canonical_items_benchmarkable', 'canonical_items', ['benchmarkable'])

    # 8. Canonical Item Aliases Table
    op.create_table(
        'canonical_item_aliases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('canonical_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('canonical_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('alias', sa.String(length=255), nullable=False),
        sa.Column('source', sa.String(length=50), server_default='seed', nullable=False),
    )
    op.create_index('idx_canonical_item_aliases_alias', 'canonical_item_aliases', ['alias'])

    # 9. SKU Mappings Table (Normalization Cache)
    op.create_table(
        'sku_mappings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('supplier_sku', sa.String(length=100), nullable=False),
        sa.Column('canonical_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('canonical_items.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('pack_units', sa.Integer(), server_default='1', nullable=False),
        sa.Column('pack_size', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('pack_measure', sa.String(length=20), nullable=True),
        sa.Column('confidence', sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column('confirmed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('supplier_id', 'supplier_sku', name='uq_supplier_sku_mapping')
    )

    # 10. Invoice Lines Table
    op.create_table(
        'invoice_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('line_index', sa.Integer(), nullable=False),
        sa.Column('raw_description', sa.String(length=500), nullable=False),
        sa.Column('supplier_sku', sa.String(length=100), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column('pack_descriptor', sa.String(length=100), nullable=True),
        sa.Column('unit_price', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('line_total', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('line_kind', sa.String(length=20), server_default='item', nullable=False),
        sa.Column('catch_weight_kg', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('canonical_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('canonical_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('pack_units', sa.Integer(), server_default='1', nullable=False),
        sa.Column('pack_size', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('pack_measure', sa.String(length=20), nullable=True),
        sa.Column('price_per_base_unit', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('is_promotional', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('confidence', sa.Numeric(precision=4, scale=3), nullable=True),
    )
    op.create_index('idx_invoice_lines_invoice_id', 'invoice_lines', ['invoice_id'])
    op.create_index('idx_invoice_lines_canonical_item', 'invoice_lines', ['canonical_item_id'])

    # 11. Review Items Table
    op.create_table(
        'review_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('kind', sa.String(length=50), nullable=False),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=True),
        sa.Column('invoice_line_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoice_lines.id', ondelete='CASCADE'), nullable=True),
        sa.Column('payload', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('assignee', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_review_items_status', 'review_items', ['status'])

    # 12. Benchmark Observations Table
    op.create_table(
        'benchmark_observations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('restaurant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('canonical_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('canonical_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('observed_on', sa.Date(), nullable=False),
        sa.Column('price_per_base_unit', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('geom', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326), nullable=False),
    )
    op.create_index('idx_benchmark_lookup', 'benchmark_observations', ['canonical_item_id', 'observed_on'])

    # 13. get_benchmark Function (Section 3.7 & 6.1)
    op.execute("""
    CREATE OR REPLACE FUNCTION get_benchmark(
        p_restaurant_id UUID,
        p_canonical_item UUID,
        p_window_days INT
    )
    RETURNS TABLE (
        p25 NUMERIC,
        p50 NUMERIC,
        p75 NUMERIC,
        n_restaurants INT,
        radius_km_used INT,
        window_start DATE,
        window_end DATE,
        suppressed BOOL,
        suppression_reason TEXT
    ) AS $$
    DECLARE
        v_origin GEOGRAPHY;
        v_start DATE;
        v_end DATE;
        v_radius INT;
        v_radii INT[] := ARRAY[3000, 7000, 15000, 100000]; -- meters: 3km, 7km, 15km, GTA-wide (100km)
        v_r_count INT;
        v_obs_count INT;
        v_max_pct NUMERIC;
        v_p25 NUMERIC;
        v_p50 NUMERIC;
        v_p75 NUMERIC;
    BEGIN
        -- Server-constrained rolling window: only 30 or 90 allowed
        IF p_window_days NOT IN (30, 90) THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, NULL::DATE, NULL::DATE,
                                TRUE, 'Invalid rolling window. Only 30 or 90 days allowed.';
            RETURN;
        END IF;

        -- Trailing window lagged by 7 days to prevent real-time price coordination / differencing attacks
        v_end := CURRENT_DATE - INTERVAL '7 days';
        v_start := v_end - (p_window_days || ' days')::INTERVAL;

        -- Get origin geometry for the querying restaurant
        SELECT geom INTO v_origin FROM restaurants WHERE id = p_restaurant_id;
        IF v_origin IS NULL THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, v_start, v_end,
                                TRUE, 'Restaurant location not found or missing geometry.';
            RETURN;
        END IF;

        -- Check benchmarkable flag
        IF NOT EXISTS (SELECT 1 FROM canonical_items WHERE id = p_canonical_item AND benchmarkable = TRUE) THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, v_start, v_end,
                                TRUE, 'Item is not eligible for anonymous benchmarking.';
            RETURN;
        END IF;

        -- Climb the radius ladder: 3km -> 7km -> 15km -> GTA-wide
        FOREACH v_radius IN ARRAY v_radii LOOP
            -- Count distinct restaurants and total observations in this cell
            SELECT 
                COUNT(*),
                COALESCE(SUM(cnt), 0),
                COALESCE(MAX(restaurant_share), 0)
            INTO v_r_count, v_obs_count, v_max_pct
            FROM (
                SELECT 
                    restaurant_id,
                    COUNT(*) AS cnt,
                    COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (), 0) AS restaurant_share
                FROM benchmark_observations
                WHERE canonical_item_id = p_canonical_item
                  AND observed_on BETWEEN v_start AND v_end
                  AND ST_DWithin(geom, v_origin, v_radius)
                GROUP BY restaurant_id
            ) sub;

            -- Check k-anonymity thresholds:
            -- 1. Min 5 distinct restaurants
            -- 2. Min 15 observations
            -- 3. Max single-restaurant dominance <= 30%
            IF v_r_count >= 5 AND v_obs_count >= 15 AND v_max_pct <= 0.30 THEN
                SELECT 
                    percentile_cont(0.25) WITHIN GROUP (ORDER BY price_per_base_unit),
                    percentile_cont(0.50) WITHIN GROUP (ORDER BY price_per_base_unit),
                    percentile_cont(0.75) WITHIN GROUP (ORDER BY price_per_base_unit)
                INTO v_p25, v_p50, v_p75
                FROM benchmark_observations
                WHERE canonical_item_id = p_canonical_item
                  AND observed_on BETWEEN v_start AND v_end
                  AND ST_DWithin(geom, v_origin, v_radius);

                RETURN QUERY SELECT 
                    ROUND(v_p25, 4),
                    ROUND(v_p50, 4),
                    ROUND(v_p75, 4),
                    v_r_count,
                    (v_radius / 1000)::INT,
                    v_start,
                    v_end,
                    FALSE,
                    NULL::TEXT;
                RETURN;
            END IF;
        END LOOP;

        -- Thresholds failed even at GTA-wide radius: suppress cell
        RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, v_r_count, NULL::INT, v_start, v_end,
                            TRUE, 'Sample density insufficient (k-anonymity minimum 5 restaurants, 15 observations, <=30% dominance).';
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS get_benchmark(UUID, UUID, INT);")
    op.drop_table('benchmark_observations')
    op.drop_table('review_items')
    op.drop_table('invoice_lines')
    op.drop_table('sku_mappings')
    op.drop_table('canonical_item_aliases')
    op.drop_table('canonical_items')
    op.drop_table('invoices')
    op.drop_table('documents')
    op.drop_table('suppliers')
    op.drop_table('users')
    op.drop_table('restaurants')
