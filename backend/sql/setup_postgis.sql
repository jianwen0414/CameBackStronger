-- ============================================================================
-- NightWalk PostGIS Setup
-- Run this in Supabase SQL Editor to create the required functions
-- ============================================================================

-- Enable PostGIS extension (should already be enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- Function: Find immediate dangers within radius
-- ============================================================================
CREATE OR REPLACE FUNCTION find_immediate_dangers_nearby(
    query_lat DOUBLE PRECISION,
    query_long DOUBLE PRECISION,
    radius_m DOUBLE PRECISION
)
RETURNS TABLE (
    id UUID,
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
        ST_Y(idl.coordinates::geometry) as lat,
        ST_X(idl.coordinates::geometry) as long,
        idl.activity_type,
        idl.evidence_video_url,
        idl.is_active,
        idl.detected_at
    FROM immediate_danger_logs idl
    WHERE ST_DWithin(
        idl.coordinates::geography,
        ST_SetSRID(ST_MakePoint(query_long, query_lat), 4326)::geography,
        radius_m
    )
    AND idl.is_active = true
    ORDER BY idl.detected_at DESC;
END;
$$;

-- ============================================================================
-- Function: Find suspicious activities within radius
-- ============================================================================
CREATE OR REPLACE FUNCTION find_suspicious_nearby(
    query_lat DOUBLE PRECISION,
    query_long DOUBLE PRECISION,
    radius_m DOUBLE PRECISION
)
RETURNS TABLE (
    id UUID,
    lat DOUBLE PRECISION,
    long DOUBLE PRECISION,
    location_id TEXT,
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
        ST_Y(sil.coordinates::geometry) as lat,
        ST_X(sil.coordinates::geometry) as long,
        sil.location_id,
        sil.person_id_hash,
        sil.evidence_video_url,
        sil.status,
        sil.detected_at
    FROM suspicious_individual_logs sil
    WHERE ST_DWithin(
        sil.coordinates::geography,
        ST_SetSRID(ST_MakePoint(query_long, query_lat), 4326)::geography,
        radius_m
    )
    AND sil.status = 'pending'
    ORDER BY sil.detected_at DESC;
END;
$$;

-- ============================================================================
-- Enable Realtime for alerts tables
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE immediate_danger_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE suspicious_individual_logs;

-- ============================================================================
-- Grant execute permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION find_immediate_dangers_nearby TO authenticated;
GRANT EXECUTE ON FUNCTION find_immediate_dangers_nearby TO service_role;
GRANT EXECUTE ON FUNCTION find_suspicious_nearby TO authenticated;
GRANT EXECUTE ON FUNCTION find_suspicious_nearby TO service_role;
