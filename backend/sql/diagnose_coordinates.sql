-- ============================================================================
-- Diagnostic Query: Check how coordinates are stored and returned
-- Run this to verify your data structure
-- ============================================================================

-- Check immediate dangers with coordinate formats
SELECT 
    id,
    location_name,
    coordinates, -- Raw geography column
    ST_AsText(coordinates::geometry) as coordinates_wkt, -- WKT format
    ST_Y(coordinates::geometry) as lat, -- Extracted latitude
    ST_X(coordinates::geometry) as long, -- Extracted longitude
    activity_type,
    is_active,
    detected_at
FROM immediate_danger_logs
WHERE is_active = true
LIMIT 5;

-- Check suspicious logs with coordinate formats
SELECT 
    id,
    location_name,
    coordinates, -- Raw geography column
    ST_AsText(coordinates::geometry) as coordinates_wkt, -- WKT format
    ST_Y(coordinates::geometry) as lat, -- Extracted latitude
    ST_X(coordinates::geometry) as long, -- Extracted longitude
    status,
    detected_at
FROM suspicious_individual_logs
WHERE status = 'pending'
LIMIT 5;

-- ============================================================================
-- If coordinates are NULL, the data wasn't inserted correctly
-- ============================================================================
