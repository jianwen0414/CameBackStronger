-- ============================================================================
-- Fix: Create database functions that return alerts with coordinates extracted
-- This ensures the frontend receives lat/long directly without parsing issues
-- ============================================================================

-- Function to get immediate dangers with extracted coordinates
CREATE OR REPLACE FUNCTION get_immediate_dangers()
RETURNS TABLE (
    id UUID,
    location_name TEXT,
    coordinates TEXT, -- WKT format for compatibility
    lat DOUBLE PRECISION,
    long DOUBLE PRECISION,
    activity_type TEXT,
    evidence_video_url TEXT,
    is_active BOOLEAN,
    detected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        idl.id,
        idl.location_name,
        ST_AsText(idl.coordinates::geometry) as coordinates,
        ST_Y(idl.coordinates::geometry) as lat,
        ST_X(idl.coordinates::geometry) as long,
        idl.activity_type::TEXT,
        idl.evidence_video_url,
        idl.is_active,
        idl.detected_at
    FROM immediate_danger_logs idl
    WHERE idl.is_active = true
    ORDER BY idl.detected_at DESC
    LIMIT 100;
END;
$$;

-- Function to get suspicious logs with extracted coordinates
CREATE OR REPLACE FUNCTION get_suspicious_logs()
RETURNS TABLE (
    id UUID,
    location_name TEXT,
    location_id TEXT,
    coordinates TEXT, -- WKT format for compatibility
    lat DOUBLE PRECISION,
    long DOUBLE PRECISION,
    person_id_hash TEXT,
    evidence_video_url TEXT,
    status TEXT,
    detected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sil.id,
        sil.location_name,
        sil.location_id,
        ST_AsText(sil.coordinates::geometry) as coordinates,
        ST_Y(sil.coordinates::geometry) as lat,
        ST_X(sil.coordinates::geometry) as long,
        sil.person_id_hash,
        sil.evidence_video_url,
        sil.status::TEXT,
        sil.detected_at
    FROM suspicious_individual_logs sil
    WHERE sil.status = 'pending'
    ORDER BY sil.detected_at DESC
    LIMIT 100;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_immediate_dangers TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_suspicious_logs TO authenticated, anon;

-- ============================================================================
-- Alternative approach: Use the views (already created in fix_coordinates_view.sql)
-- The views are simpler but functions give more control
-- ============================================================================
