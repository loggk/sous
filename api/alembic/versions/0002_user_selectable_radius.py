"""user_selectable_radius

Revision ID: 0002_user_selectable_radius
Revises: 0001_initial_schema
Create Date: 2026-11-04

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0002_user_selectable_radius'
down_revision = '0001_initial_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop the legacy 3-parameter get_benchmark function
    op.execute("DROP FUNCTION IF EXISTS get_benchmark(UUID, UUID, INT);")

    # 2. Create the upgraded stored procedure supporting user-selected radius (p_target_radius_km)
    op.execute("""
    CREATE OR REPLACE FUNCTION get_benchmark(
        p_restaurant_id UUID,
        p_canonical_item UUID,
        p_window_days INT,
        p_target_radius_km INT DEFAULT NULL
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
        v_radii INT[];
        v_r_count INT;
        v_obs_count INT;
        v_max_pct NUMERIC;
        v_p25 NUMERIC;
        v_p50 NUMERIC;
        v_p75 NUMERIC;
    BEGIN
        -- Server-constrained rolling window: only 30 or 90 allowed to protect against differencing attacks
        IF p_window_days NOT IN (30, 90) THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, NULL::DATE, NULL::DATE,
                                TRUE, 'Invalid rolling window. Only 30 or 90 days allowed.';
            RETURN;
        END IF;

        -- Trailing window lagged by 7 days to prevent real-time price coordination
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

        -- Determine radii search path
        IF p_target_radius_km IS NOT NULL AND p_target_radius_km > 0 THEN
            -- User explicitly selected a target radius (e.g., 3, 5, 10, 15, 25, 50, 100 km)
            v_radii := ARRAY[p_target_radius_km * 1000];
        ELSE
            -- Default adaptive ladder: 3km -> 7km -> 15km -> GTA-wide (100km)
            v_radii := ARRAY[3000, 7000, 15000, 100000];
        END IF;

        -- Climb the radius ladder (or evaluate single selected radius)
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

        -- If threshold failed:
        IF p_target_radius_km IS NOT NULL AND p_target_radius_km > 0 THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, v_r_count, p_target_radius_km, v_start, v_end,
                                TRUE, 'Sample density within ' || p_target_radius_km || ' km insufficient (' || v_r_count || ' restaurants reporting, minimum 5 required for k-anonymity).';
        ELSE
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, v_r_count, NULL::INT, v_start, v_end,
                                TRUE, 'Sample density insufficient across GTA (k-anonymity minimum 5 restaurants, 15 observations, <=30% dominance).';
        END IF;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS get_benchmark(UUID, UUID, INT, INT);")
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
        v_radii INT[] := ARRAY[3000, 7000, 15000, 100000];
        v_r_count INT;
        v_obs_count INT;
        v_max_pct NUMERIC;
        v_p25 NUMERIC;
        v_p50 NUMERIC;
        v_p75 NUMERIC;
    BEGIN
        IF p_window_days NOT IN (30, 90) THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, NULL::DATE, NULL::DATE,
                                TRUE, 'Invalid rolling window. Only 30 or 90 days allowed.';
            RETURN;
        END IF;

        v_end := CURRENT_DATE - INTERVAL '7 days';
        v_start := v_end - (p_window_days || ' days')::INTERVAL;

        SELECT geom INTO v_origin FROM restaurants WHERE id = p_restaurant_id;
        IF v_origin IS NULL THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, v_start, v_end,
                                TRUE, 'Restaurant location not found or missing geometry.';
            RETURN;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM canonical_items WHERE id = p_canonical_item AND benchmarkable = TRUE) THEN
            RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 0, NULL::INT, v_start, v_end,
                                TRUE, 'Item is not eligible for anonymous benchmarking.';
            RETURN;
        END IF;

        FOREACH v_radius IN ARRAY v_radii LOOP
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

        RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, v_r_count, NULL::INT, v_start, v_end,
                            TRUE, 'Sample density insufficient (k-anonymity minimum 5 restaurants, 15 observations, <=30% dominance).';
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
    """)
