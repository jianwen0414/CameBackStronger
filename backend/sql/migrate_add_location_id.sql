-- ============================================================================
-- Migration: Add location_id column to suspicious_individual_logs
-- Run this if your database already exists and needs the location_id column
-- ============================================================================

-- Add location_id column if it doesn't exist
ALTER TABLE suspicious_individual_logs 
ADD COLUMN IF NOT EXISTS location_id text;

-- Add comment for documentation
COMMENT ON COLUMN suspicious_individual_logs.location_id IS 'Camera/location identifier (for IoT devices)';
