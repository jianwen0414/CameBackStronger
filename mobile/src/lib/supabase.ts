/**
 * NightWalk Mobile - Supabase Client
 */
import { createClient } from '@supabase/supabase-js';
import Config from 'react-native-config';

const supabaseUrl = Config.SUPABASE_URL || '';
const supabaseAnonKey = Config.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// Types
// ============================================================================

export interface ImmediateDanger {
    id: string;
    coordinates: string;
    activity_type: 'fight' | 'weapon' | 'robbery';
    evidence_video_url: string;
    is_active: boolean;
    detected_at: string;
    lat?: number;
    long?: number;
}

export interface SuspiciousLog {
    id: string;
    coordinates: string;
    location_id?: string;
    person_id_hash?: string;
    evidence_video_url: string;
    status: 'pending' | 'resolved';
    detected_at: string;
    lat?: number;
    long?: number;
}

export type CrimeType =
    | 'abuse' | 'arrest' | 'arson' | 'assault' | 'burglary'
    | 'explosion' | 'fighting' | 'road_accidents' | 'robbery'
    | 'shooting' | 'stealing' | 'vandalism';

export type ValidationStatus = 'pending' | 'processing' | 'validated' | 'rejected' | 'reviewed';

export interface UserReportedCrime {
    id: string;
    reporter_id?: string;
    lat: number;
    long: number;
    crime_type: CrimeType;
    description?: string;
    evidence_video_url: string;
    classified_crime_type?: string;
    classification_confidence?: number;
    gemini_analysis?: string;
    gemini_justification?: string;
    validation_status: ValidationStatus;
    reported_at: string;
}

export type BeaconKind = 'immediate' | 'suspicious' | 'report';

export interface HazardData {
    id: string;
    coordinates: { lat: number; long: number };
    type: string;
    distance_meters: number;
    bearing_degrees: number;
    is_immediate: boolean;
    detected_at: string;
    beacon_kind: BeaconKind; // Controls colour on map
}

// Parse PostGIS Point - Handles multiple formats including EWKB hex
export function parsePostGISPoint(point: any): { lat: number; long: number } | null {
    if (!point) return null;

    // If it's already an object with lat/long
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
                // Byte layout (little-endian):
                //   [0]       1 byte  - byte order (01 = LE)
                //   [1..4]    4 bytes  - geometry type (with SRID flag if present)
                //   [5..8]    4 bytes  - SRID (only if hasSRID)
                //   [offset]  8 bytes  - X (longitude)
                //   [offset+8] 8 bytes - Y (latitude)
                const coordOffset = hasSRID ? 18 : 10; // hex char offset (9 or 5 bytes)
                const xHex = point.substring(coordOffset, coordOffset + 16);
                const yHex = point.substring(coordOffset + 16, coordOffset + 32);

                const x = parseHexFloat64LE(xHex); // longitude
                const y = parseHexFloat64LE(yHex); // latitude

                if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
                    return { long: x, lat: y };
                }
            } catch (e) {
                console.warn('[parsePostGISPoint] EWKB parse error:', e);
            }
        }
    }

    return null;
}

/**
 * Parse a 16-character hex string as a little-endian IEEE 754 double.
 * Pure JS — no Buffer or Node dependencies.
 */
function parseHexFloat64LE(hex: string): number {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    for (let i = 0; i < 8; i++) {
        view.setUint8(i, parseInt(hex.substring(i * 2, i * 2 + 2), 16));
    }
    return view.getFloat64(0, true); // true = little-endian
}
