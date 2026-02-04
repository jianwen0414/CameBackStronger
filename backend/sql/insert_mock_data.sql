-- ============================================================================
-- NightWalk Mock Data Insert Script
-- Inserts test data around coordinates: 4.647997024420677, 101.11118512535789
-- Run this in Supabase SQL Editor after setting up tables
-- ============================================================================

-- Clear existing mock data (optional - comment out if you want to keep existing data)
-- DELETE FROM immediate_danger_logs WHERE location_name LIKE 'Mock%';
-- DELETE FROM suspicious_individual_logs WHERE location_name LIKE 'Mock%';

-- ============================================================================
-- Mock Immediate Danger Logs
-- Coordinates around: 4.647997024420677, 101.11118512535789
-- ============================================================================

-- Mock Danger 1: Fight detected (recent - 2 minutes ago)
INSERT INTO immediate_danger_logs (
    location_name,
    coordinates,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
) VALUES (
    'Mock Fight Incident - Central Plaza',
    ST_SetSRID(ST_MakePoint(101.11118512535789, 4.647997024420677), 4326)::geography,
    'fight',
    'https://storage.googleapis.com/nightwalk-evidence/mock-fight-1.mp4',
    true,
    NOW() - INTERVAL '2 minutes'
);

-- Mock Danger 2: Weapon detected (5 minutes ago)
INSERT INTO immediate_danger_logs (
    location_name,
    coordinates,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
) VALUES (
    'Mock Weapon Detection - North Street',
    ST_SetSRID(ST_MakePoint(101.111500, 4.648200), 4326)::geography,
    'weapon',
    'https://storage.googleapis.com/nightwalk-evidence/mock-weapon-1.mp4',
    true,
    NOW() - INTERVAL '5 minutes'
);

-- Mock Danger 3: Robbery detected (10 minutes ago)
INSERT INTO immediate_danger_logs (
    location_name,
    coordinates,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
) VALUES (
    'Mock Robbery Incident - East Market',
    ST_SetSRID(ST_MakePoint(101.110800, 4.647500), 4326)::geography,
    'robbery',
    'https://storage.googleapis.com/nightwalk-evidence/mock-robbery-1.mp4',
    true,
    NOW() - INTERVAL '10 minutes'
);

-- Mock Danger 4: Fight detected (15 minutes ago)
INSERT INTO immediate_danger_logs (
    location_name,
    coordinates,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
) VALUES (
    'Mock Fight Incident - South Park',
    ST_SetSRID(ST_MakePoint(101.111800, 4.647200), 4326)::geography,
    'fight',
    'https://storage.googleapis.com/nightwalk-evidence/mock-fight-2.mp4',
    true,
    NOW() - INTERVAL '15 minutes'
);

-- Mock Danger 5: Weapon detected (20 minutes ago, resolved/inactive)
INSERT INTO immediate_danger_logs (
    location_name,
    coordinates,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
) VALUES (
    'Mock Weapon Detection - West Bridge',
    ST_SetSRID(ST_MakePoint(101.110500, 4.648500), 4326)::geography,
    'weapon',
    'https://storage.googleapis.com/nightwalk-evidence/mock-weapon-2.mp4',
    false,
    NOW() - INTERVAL '20 minutes'
);

-- Mock Danger 6: Robbery detected (30 minutes ago)
INSERT INTO immediate_danger_logs (
    location_name,
    coordinates,
    activity_type,
    evidence_video_url,
    is_active,
    detected_at
) VALUES (
    'Mock Robbery Incident - Downtown Area',
    ST_SetSRID(ST_MakePoint(101.111200, 4.648000), 4326)::geography,
    'robbery',
    'https://storage.googleapis.com/nightwalk-evidence/mock-robbery-2.mp4',
    true,
    NOW() - INTERVAL '30 minutes'
);

-- ============================================================================
-- Mock Suspicious Individual Logs
-- Coordinates around: 4.647997024420677, 101.11118512535789
-- ============================================================================

-- Mock Suspicious 1: Recent loitering (3 minutes ago)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone A - Shopping Mall Entrance',
    'zone-a',
    ST_SetSRID(ST_MakePoint(101.111400, 4.648100), 4326)::geography,
    'mock-person-hash-001',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-1.mp4',
    'pending',
    NOW() - INTERVAL '3 minutes'
);

-- Mock Suspicious 2: Loitering (7 minutes ago)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone B - Bus Station',
    'zone-b',
    ST_SetSRID(ST_MakePoint(101.110900, 4.647600), 4326)::geography,
    'mock-person-hash-002',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-2.mp4',
    'pending',
    NOW() - INTERVAL '7 minutes'
);

-- Mock Suspicious 3: Loitering (12 minutes ago)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone C - Parking Lot',
    'zone-c',
    ST_SetSRID(ST_MakePoint(101.111600, 4.647300), 4326)::geography,
    'mock-person-hash-003',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-3.mp4',
    'pending',
    NOW() - INTERVAL '12 minutes'
);

-- Mock Suspicious 4: Loitering (18 minutes ago)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone D - Residential Area',
    'zone-d',
    ST_SetSRID(ST_MakePoint(101.110600, 4.648300), 4326)::geography,
    'mock-person-hash-004',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-4.mp4',
    'pending',
    NOW() - INTERVAL '18 minutes'
);

-- Mock Suspicious 5: Loitering (25 minutes ago)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone E - School Area',
    'zone-e',
    ST_SetSRID(ST_MakePoint(101.111300, 4.647800), 4326)::geography,
    'mock-person-hash-005',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-5.mp4',
    'pending',
    NOW() - INTERVAL '25 minutes'
);

-- Mock Suspicious 6: Loitering (35 minutes ago, resolved)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone F - Library Entrance',
    'zone-f',
    ST_SetSRID(ST_MakePoint(101.111000, 4.648400), 4326)::geography,
    'mock-person-hash-006',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-6.mp4',
    'resolved',
    NOW() - INTERVAL '35 minutes'
);

-- Mock Suspicious 7: Loitering (45 minutes ago, false alarm)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone G - Restaurant Area',
    'zone-g',
    ST_SetSRID(ST_MakePoint(101.111700, 4.647400), 4326)::geography,
    'mock-person-hash-007',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-7.mp4',
    'false_alarm',
    NOW() - INTERVAL '45 minutes'
);

-- Mock Suspicious 8: Loitering (1 hour ago, investigating)
INSERT INTO suspicious_individual_logs (
    location_name,
    location_id,
    coordinates,
    person_id_hash,
    evidence_video_url,
    status,
    detected_at
) VALUES (
    'Mock Loitering Zone H - Office Building',
    'zone-h',
    ST_SetSRID(ST_MakePoint(101.110700, 4.647700), 4326)::geography,
    'mock-person-hash-008',
    'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-8.mp4',
    'investigating',
    NOW() - INTERVAL '1 hour'
);

-- ============================================================================
-- Verification Queries (Optional - run to verify data was inserted)
-- ============================================================================

-- Count immediate dangers
-- SELECT COUNT(*) as immediate_danger_count FROM immediate_danger_logs WHERE location_name LIKE 'Mock%';

-- Count suspicious logs
-- SELECT COUNT(*) as suspicious_log_count FROM suspicious_individual_logs WHERE location_name LIKE 'Mock%';

-- View all mock immediate dangers
-- SELECT 
--     id,
--     location_name,
--     ST_Y(coordinates::geometry) as lat,
--     ST_X(coordinates::geometry) as long,
--     activity_type,
--     is_active,
--     detected_at
-- FROM immediate_danger_logs 
-- WHERE location_name LIKE 'Mock%'
-- ORDER BY detected_at DESC;

-- View all mock suspicious logs
-- SELECT 
--     id,
--     location_name,
--     ST_Y(coordinates::geometry) as lat,
--     ST_X(coordinates::geometry) as long,
--     person_id_hash,
--     status,
--     detected_at
-- FROM suspicious_individual_logs 
-- WHERE location_name LIKE 'Mock%'
-- ORDER BY detected_at DESC;
