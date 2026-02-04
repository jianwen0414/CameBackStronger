-- ============================================================================
-- Fix: Create database views that convert PostGIS geography to readable format
-- This ensures Supabase returns coordinates in a format the frontend can parse
-- ============================================================================

-- View for immediate_danger_logs with coordinates as WKT
CREATE OR REPLACE VIEW immediate_danger_logs_view AS
SELECT 
    id,
    location_name,
    ST_AsText(coordinates::geometry) as coordinates_wkt,
    ST_Y(coordinates::geometry) as lat,
    ST_X(coordinates::geometry) as long,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
FROM immediate_danger_logs;

-- View for suspicious_individual_logs with coordinates as WKT
CREATE OR REPLACE VIEW suspicious_individual_logs_view AS
SELECT 
    id,
    location_name,
    location_id,
    ST_AsText(coordinates::geometry) as coordinates_wkt,
    ST_Y(coordinates::geometry) as lat,
    ST_X(coordinates::geometry) as long,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
FROM suspicious_individual_logs;

-- Grant access to views
GRANT SELECT ON immediate_danger_logs_view TO authenticated, anon;
GRANT SELECT ON suspicious_individual_logs_view TO authenticated, anon;

-- ============================================================================
-- Alternative: Update RLS policies to allow direct access with coordinate conversion
-- ============================================================================

-- Note: The views above are the recommended approach, but if you prefer to keep
-- using the original tables, you can modify the SELECT queries in the frontend
-- to use ST_AsText() function. However, Supabase client doesn't support 
-- PostGIS functions directly in select(), so views are the better solution.
