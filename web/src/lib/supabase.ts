/**
 * NightWalk Web - Supabase Client
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// Beacon Types - 4 colours
// ============================================================================
export type BeaconType = 'red' | 'yellow' | 'blue' | 'purple';

// ============================================================================
// Types for database tables
// ============================================================================
export type ImmediateDanger = {
    id: string;
    location_name?: string;
    coordinates: string; // PostGIS Point as WKT
    activity_type: 'fight' | 'weapon' | 'robbery';
    evidence_video_url: string;
    is_active: boolean;
    detected_at: string;
    person_id?: number;
    location_id?: string;
    // Parsed coordinates
    lat?: number;
    long?: number;
    altitude?: number;
};

export type SuspiciousLog = {
    id: string;
    location_name?: string;
    coordinates: string;
    location_id?: string;
    person_id_hash?: string;
    evidence_video_url: string;
    status: 'pending' | 'investigating' | 'resolved' | 'false_alarm';
    detected_at: string;
    lat?: number;
    long?: number;
    altitude?: number;
};

export type CCTVCamera = {
    id: string;
    camera_name: string;
    location_name?: string;
    lat: number;
    long: number;
    altitude?: number;
    stream_url?: string;
    is_active: boolean;
    last_heartbeat?: string;
};

export type CrimeType =
    | 'abuse' | 'arrest' | 'arson' | 'assault' | 'burglary'
    | 'explosion' | 'fighting' | 'road_accidents' | 'robbery'
    | 'shooting' | 'stealing' | 'vandalism';

export type ValidationStatus = 'pending' | 'processing' | 'validated' | 'rejected' | 'reviewed';

export type UserReportedCrime = {
    id: string;
    reporter_id?: string;
    lat: number;
    long: number;
    altitude?: number;
    crime_type: CrimeType;
    description?: string;
    evidence_video_url: string;
    classified_crime_type?: string;
    classification_confidence?: number;
    gemini_analysis?: string;
    gemini_justification?: string;
    validation_status: ValidationStatus;
    reported_at: string;
};

// Union type for any alert displayed on the map
export type AnyAlert = ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime;

// Parse PostGIS Point to lat/long
// Handles multiple formats: WKT, GeoJSON, EWKB hex, and Supabase's internal format
export function parsePostGISPoint(point: any): { lat: number; long: number } | null {
    if (!point) return null;

    // If it's already an object with lat/long (from database view)
    if (typeof point === 'object' && 'lat' in point && 'long' in point) {
        return { lat: point.lat, long: point.long };
    }

    // If it's a GeoJSON object
    if (typeof point === 'object' && point.type === 'Point' && Array.isArray(point.coordinates)) {
        return {
            long: point.coordinates[0],
            lat: point.coordinates[1]
        };
    }

    // If it's a string
    if (typeof point === 'string') {
        // WKT format: SRID=4326;POINT(long lat) or POINT(long lat)
        const wktMatch = point.match(/POINT\(([^ ]+) ([^)]+)\)/);
        if (wktMatch) {
            return {
                long: parseFloat(wktMatch[1]),
                lat: parseFloat(wktMatch[2])
            };
        }

        // EWKB hex format from PostGIS (e.g. 0101000020E6100000...)
        // 50 hex chars = EWKB Point with SRID, 42 hex chars = WKB Point without SRID
        if (/^[0-9a-fA-F]{42,50}$/.test(point)) {
            try {
                const hasSRID = point.length >= 50;
                const coordOffset = hasSRID ? 18 : 10; // hex char offset
                const xHex = point.substring(coordOffset, coordOffset + 16);
                const yHex = point.substring(coordOffset + 16, coordOffset + 32);
                const x = parseHexFloat64LE(xHex);
                const y = parseHexFloat64LE(yHex);
                if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
                    return { long: x, lat: y };
                }
            } catch (e) {
                console.warn('[parsePostGISPoint] EWKB parse error:', e);
            }
        }
    }

    console.warn('Unable to parse coordinates format:', typeof point, point);
    return null;
}

/** Parse a 16-char hex string as a little-endian IEEE 754 double. */
function parseHexFloat64LE(hex: string): number {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    for (let i = 0; i < 8; i++) {
        view.setUint8(i, parseInt(hex.substring(i * 2, i * 2 + 2), 16));
    }
    return view.getFloat64(0, true);
}

/**
 * Helper to determine beacon type from an alert
 */
export function getBeaconType(alert: AnyAlert): BeaconType {
    if ('activity_type' in alert) return 'red';       // ImmediateDanger
    if ('camera_name' in alert) return 'blue';         // CCTVCamera
    if ('crime_type' in alert) return 'purple';        // UserReportedCrime
    return 'yellow';                                    // SuspiciousLog
}
