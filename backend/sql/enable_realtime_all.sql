-- ============================================================================
-- NightWalk - Enable Supabase Realtime for ALL alert tables
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Enable realtime on user_reported_crimes and cctv_cameras
-- (immediate_danger_logs and suspicious_individual_logs are already added
-- in setup_postgis.sql, but we use IF NOT EXISTS-style safety)

DO $$
BEGIN
    -- Try adding each table; ignore if already in the publication
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE user_reported_crimes;
        RAISE NOTICE 'Added user_reported_crimes to supabase_realtime';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'user_reported_crimes already in supabase_realtime';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE cctv_cameras;
        RAISE NOTICE 'Added cctv_cameras to supabase_realtime';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'cctv_cameras already in supabase_realtime';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE immediate_danger_logs;
        RAISE NOTICE 'Added immediate_danger_logs to supabase_realtime';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'immediate_danger_logs already in supabase_realtime';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE suspicious_individual_logs;
        RAISE NOTICE 'Added suspicious_individual_logs to supabase_realtime';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'suspicious_individual_logs already in supabase_realtime';
    END;
END $$;

-- Set REPLICA IDENTITY to FULL so UPDATE/DELETE payloads include the old row
ALTER TABLE user_reported_crimes REPLICA IDENTITY FULL;
ALTER TABLE cctv_cameras REPLICA IDENTITY FULL;
ALTER TABLE immediate_danger_logs REPLICA IDENTITY FULL;
ALTER TABLE suspicious_individual_logs REPLICA IDENTITY FULL;
