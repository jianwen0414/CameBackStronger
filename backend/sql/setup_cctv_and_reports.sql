-- ============================================================================
-- NightWalk - New Tables: CCTV Cameras & User-Reported Crimes
-- Run after setup_tables.sql
-- ============================================================================

-- 1. Crime type enum for user reports
DO $$ BEGIN
    CREATE TYPE crime_type AS ENUM (
        'abuse', 'arrest', 'arson', 'assault', 'burglary',
        'explosion', 'fighting', 'road_accidents', 'robbery',
        'shooting', 'stealing', 'vandalism'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Validation status enum for user-reported crimes
DO $$ BEGIN
    CREATE TYPE validation_status AS ENUM (
        'pending',        -- Just submitted, awaiting model classification
        'processing',     -- Being processed by video classification model
        'validated',      -- Crime confirmed by model + Gemini analysis
        'rejected',       -- Model/Gemini determined no crime
        'reviewed'        -- Manually reviewed by admin
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. CCTV Cameras Table
-- Each CCTV camera maps to a beacon on the web dashboard
CREATE TABLE IF NOT EXISTS cctv_cameras (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    camera_name text NOT NULL,
    location_name text,
    coordinates geography(Point, 4326) NOT NULL,
    stream_url text,                    -- URL for real-time CCTV stream (or sample video)
    is_active boolean DEFAULT true,     -- Whether camera is currently active/online
    zone_id text,                       -- Optional zone grouping
    installed_at timestamptz DEFAULT now(),
    last_heartbeat timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb  -- Flexible metadata (resolution, model, etc.)
);

-- 4. User-Reported Crimes Table
CREATE TABLE IF NOT EXISTS user_reported_crimes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id uuid REFERENCES auth.users,  -- The user who reported
    coordinates geography(Point, 4326) NOT NULL,
    location_name text,
    crime_type crime_type NOT NULL,
    description text,
    evidence_video_url text NOT NULL,         -- Must attach min 7s video
    video_duration_seconds float,             -- Duration of submitted video
    
    -- Video Classification Model Results
    classification_result jsonb DEFAULT NULL, -- Full model output from videomae
    classified_crime_type text DEFAULT NULL,  -- Model's predicted crime type
    classification_confidence float DEFAULT NULL, -- Model confidence score 0-1
    
    -- Gemini AI Analysis
    gemini_analysis text DEFAULT NULL,        -- Gemini's detailed analysis text
    gemini_justification text DEFAULT NULL,   -- Gemini's justification for the crime
    
    -- Validation
    validation_status validation_status DEFAULT 'pending',
    validated_at timestamptz,
    validated_by uuid REFERENCES auth.users,  -- Admin who reviewed (if manual)
    
    -- Timestamps
    reported_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 5. Spatial Indexes
CREATE INDEX IF NOT EXISTS cctv_geo_idx ON cctv_cameras USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS reported_crimes_geo_idx ON user_reported_crimes USING GIST (coordinates);

-- 6. Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reported_crimes_status ON user_reported_crimes (validation_status);
CREATE INDEX IF NOT EXISTS idx_reported_crimes_type ON user_reported_crimes (crime_type);
CREATE INDEX IF NOT EXISTS idx_reported_crimes_reporter ON user_reported_crimes (reporter_id);
CREATE INDEX IF NOT EXISTS idx_cctv_active ON cctv_cameras (is_active);

-- 7. Row Level Security
ALTER TABLE cctv_cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reported_crimes ENABLE ROW LEVEL SECURITY;

-- CCTV: Everyone can read (for web dashboard), only admins/service can modify
CREATE POLICY "Public Read CCTV" ON cctv_cameras FOR SELECT USING (true);
CREATE POLICY "Service Insert CCTV" ON cctv_cameras FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service Update CCTV" ON cctv_cameras FOR UPDATE USING (auth.role() = 'service_role');

-- User Reports: Everyone can read validated reports, authenticated users can insert
CREATE POLICY "Public Read Validated Reports" ON user_reported_crimes 
    FOR SELECT USING (true);
CREATE POLICY "Authenticated Insert Reports" ON user_reported_crimes 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Service Update Reports" ON user_reported_crimes 
    FOR UPDATE USING (auth.role() = 'service_role');

-- 8. RPC: Find nearby CCTV cameras
CREATE OR REPLACE FUNCTION find_nearby_cctv(
    query_lat double precision,
    query_long double precision,
    radius_m double precision DEFAULT 2000
)
RETURNS TABLE (
    id uuid,
    camera_name text,
    location_name text,
    lat double precision,
    long double precision,
    stream_url text,
    is_active boolean,
    distance_m double precision
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id,
        c.camera_name,
        c.location_name,
        ST_Y(c.coordinates::geometry) AS lat,
        ST_X(c.coordinates::geometry) AS long,
        c.stream_url,
        c.is_active,
        ST_Distance(
            c.coordinates,
            ST_SetSRID(ST_MakePoint(query_long, query_lat), 4326)::geography
        ) AS distance_m
    FROM cctv_cameras c
    WHERE c.is_active = true
      AND ST_DWithin(
          c.coordinates,
          ST_SetSRID(ST_MakePoint(query_long, query_lat), 4326)::geography,
          radius_m
      )
    ORDER BY distance_m;
$$;

-- 9. RPC: Find nearby user-reported crimes (only validated ones for mobile)
CREATE OR REPLACE FUNCTION find_nearby_reported_crimes(
    query_lat double precision,
    query_long double precision,
    radius_m double precision DEFAULT 2000,
    include_all boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    reporter_id uuid,
    lat double precision,
    long double precision,
    crime_type crime_type,
    description text,
    evidence_video_url text,
    classified_crime_type text,
    classification_confidence float,
    gemini_analysis text,
    gemini_justification text,
    validation_status validation_status,
    reported_at timestamptz,
    distance_m double precision
)
LANGUAGE sql STABLE
AS $$
    SELECT
        r.id,
        r.reporter_id,
        ST_Y(r.coordinates::geometry) AS lat,
        ST_X(r.coordinates::geometry) AS long,
        r.crime_type,
        r.description,
        r.evidence_video_url,
        r.classified_crime_type,
        r.classification_confidence,
        r.gemini_analysis,
        r.gemini_justification,
        r.validation_status,
        r.reported_at,
        ST_Distance(
            r.coordinates,
            ST_SetSRID(ST_MakePoint(query_long, query_lat), 4326)::geography
        ) AS distance_m
    FROM user_reported_crimes r
    WHERE ST_DWithin(
            r.coordinates,
            ST_SetSRID(ST_MakePoint(query_long, query_lat), 4326)::geography,
            radius_m
        )
      AND (include_all = true OR r.validation_status = 'validated')
    ORDER BY r.reported_at DESC;
$$;

-- 10. RPC: Get all CCTV cameras (for web dashboard)
CREATE OR REPLACE FUNCTION get_all_cctv()
RETURNS TABLE (
    id uuid,
    camera_name text,
    location_name text,
    lat double precision,
    long double precision,
    stream_url text,
    is_active boolean,
    last_heartbeat timestamptz
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id,
        c.camera_name,
        c.location_name,
        ST_Y(c.coordinates::geometry) AS lat,
        ST_X(c.coordinates::geometry) AS long,
        c.stream_url,
        c.is_active,
        c.last_heartbeat
    FROM cctv_cameras c
    WHERE c.is_active = true
    ORDER BY c.camera_name;
$$;

-- 11. RPC: Get all user-reported crimes (for web dashboard - includes all statuses)
CREATE OR REPLACE FUNCTION get_all_reported_crimes()
RETURNS TABLE (
    id uuid,
    reporter_id uuid,
    lat double precision,
    long double precision,
    crime_type crime_type,
    description text,
    evidence_video_url text,
    classified_crime_type text,
    classification_confidence float,
    gemini_analysis text,
    gemini_justification text,
    validation_status validation_status,
    reported_at timestamptz
)
LANGUAGE sql STABLE
AS $$
    SELECT
        r.id,
        r.reporter_id,
        ST_Y(r.coordinates::geometry) AS lat,
        ST_X(r.coordinates::geometry) AS long,
        r.crime_type,
        r.description,
        r.evidence_video_url,
        r.classified_crime_type,
        r.classification_confidence,
        r.gemini_analysis,
        r.gemini_justification,
        r.validation_status,
        r.reported_at
    FROM user_reported_crimes r
    ORDER BY r.reported_at DESC;
$$;

-- 12. Insert mock CCTV data (matching the existing coordinate area)
INSERT INTO cctv_cameras (camera_name, location_name, coordinates, stream_url, is_active)
VALUES
    ('CAM-001', 'Main Street Junction', ST_SetSRID(ST_MakePoint(101.1108, 4.6475), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-002', 'Park Entrance North', ST_SetSRID(ST_MakePoint(101.1115, 4.6485), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-003', 'Residential Block A', ST_SetSRID(ST_MakePoint(101.1120, 4.6470), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-004', 'Shopping District East', ST_SetSRID(ST_MakePoint(101.1100, 4.6490), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-005', 'Pedestrian Walkway', ST_SetSRID(ST_MakePoint(101.1125, 4.6480), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-006', 'Underground Parking', ST_SetSRID(ST_MakePoint(101.1105, 4.6465), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-007', 'School Zone Crossing', ST_SetSRID(ST_MakePoint(101.1130, 4.6495), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true),
    ('CAM-008', 'Night Market Area', ST_SetSRID(ST_MakePoint(101.1095, 4.6500), 4326)::geography, 'https://storage.googleapis.com/nightwalk-evidence/sample-cctv-stream.mp4', true)
ON CONFLICT DO NOTHING;
