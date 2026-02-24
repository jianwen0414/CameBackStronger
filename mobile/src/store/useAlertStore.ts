/**
 * NightWalk Mobile - Alert Store (Zustand)
 *
 * ALL beacons (red, yellow, purple) are fetched globally and rendered on the
 * map so the user sees a proper heatmap of the entire city.
 *
 * The 1 km radius is used ONLY for:
 *   • Safety score percentage displayed at the top of the Map tab
 *   • "N hazards nearby" counter displayed at the top of the Map tab
 *
 * Purple beacons: only those with validation_status === 'validated' are shown.
 */
import { create } from 'zustand';
import { supabase, HazardData, parsePostGISPoint } from '../lib/supabase';
import type { BeaconKind } from '../lib/supabase';

// ── Haversine helper (metres) ────────────────────────────────────────────────
function haversineMetres(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
): number {
    const R = 6_371_000; // Earth radius in metres
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Radius for "nearby" safety score & count ─────────────────────────────────
const NEARBY_RADIUS_M = 1_000; // 1 km

interface AlertState {
    /** Every beacon globally (red + yellow + validated purple). */
    allHazards: HazardData[];
    /** Subset of allHazards within NEARBY_RADIUS_M of the user's position. */
    nearbyCount: number;
    /** Safety score (0-100) computed from hazards within NEARBY_RADIUS_M. */
    zoneSafety: number;
    isLoading: boolean;
    error: string | null;
    /** Lat/long used for the most recent safety score calculation. */
    userLat: number;
    userLong: number;

    // Keep the old name so MapScreen's destructuring still works
    nearbyHazards: HazardData[];

    // Actions
    fetchAllHazards: () => Promise<void>;
    /** @deprecated — alias kept for backward-compat; calls fetchAllHazards */
    fetchNearbyHazards: (lat: number, long: number, radius?: number) => Promise<void>;
    subscribeToAlerts: () => () => void;
    setUserLocation: (lat: number, long: number) => void;
    calculateZoneSafety: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
    allHazards: [],
    nearbyHazards: [],
    nearbyCount: 0,
    zoneSafety: 100,
    isLoading: false,
    error: null,
    userLat: 0,
    userLong: 0,

    // ══════════════════════════════════════════════════════════════════════════
    // Fetch ALL beacons globally (no radius filtering)
    // ══════════════════════════════════════════════════════════════════════════
    fetchAllHazards: async () => {
        set({ isLoading: true, error: null });

        try {
            const hazards: HazardData[] = [];

            // ─── 1. Red beacons: immediate_danger_logs ───────────────
            try {
                const { data: dangers, error: dErr } = await supabase
                    .from('immediate_danger_logs')
                    .select('*')
                    .eq('is_active', true)
                    .order('detected_at', { ascending: false })
                    .limit(500);

                if (dErr) console.error('Error fetching immediate dangers:', dErr);

                (dangers || []).forEach((d: any) => {
                    const coords = parsePostGISPoint(d.coordinates);
                    if (coords && coords.lat !== 0 && coords.long !== 0) {
                        hazards.push({
                            id: d.id,
                            coordinates: coords,
                            type: d.activity_type || 'danger',
                            distance_meters: 0,
                            bearing_degrees: 0,
                            is_immediate: true,
                            detected_at: d.detected_at,
                            beacon_kind: 'immediate' as BeaconKind,
                        });
                    }
                });
            } catch (e) {
                console.error('Exception fetching immediate dangers:', e);
            }

            // ─── 2. Yellow beacons: suspicious_individual_logs ───────
            try {
                const { data: suspicious, error: sErr } = await supabase
                    .from('suspicious_individual_logs')
                    .select('*')
                    .order('detected_at', { ascending: false })
                    .limit(500);

                if (sErr) console.error('Error fetching suspicious logs:', sErr);

                (suspicious || []).forEach((s: any) => {
                    const coords = parsePostGISPoint(s.coordinates);
                    if (coords && coords.lat !== 0 && coords.long !== 0) {
                        hazards.push({
                            id: s.id,
                            coordinates: coords,
                            type: 'suspicious',
                            distance_meters: 0,
                            bearing_degrees: 0,
                            is_immediate: false,
                            detected_at: s.detected_at,
                            beacon_kind: 'suspicious' as BeaconKind,
                        });
                    }
                });
            } catch (e) {
                console.error('Exception fetching suspicious logs:', e);
            }

            // ─── 3. Purple beacons: validated user-reported crimes ───
            try {
                const { data: reports, error: rErr } = await supabase
                    .from('user_reported_crimes')
                    .select('*')
                    .eq('validation_status', 'validated')
                    .order('reported_at', { ascending: false })
                    .limit(500);

                if (rErr) console.error('Error fetching validated crimes:', rErr);

                (reports || []).forEach((r: any) => {
                    const coords = parsePostGISPoint(r.coordinates);
                    if (coords && coords.lat !== 0 && coords.long !== 0) {
                        hazards.push({
                            id: r.id,
                            coordinates: coords,
                            type: r.crime_type || 'report',
                            distance_meters: 0,
                            bearing_degrees: 0,
                            is_immediate: false,
                            detected_at: r.reported_at,
                            beacon_kind: 'report' as BeaconKind,
                        });
                    }
                });
            } catch (e) {
                console.error('Exception fetching validated crimes:', e);
            }

            console.log(
                `[NightWalk] Fetched ${hazards.length} global hazards ` +
                `(${hazards.filter(h => h.beacon_kind === 'immediate').length} red, ` +
                `${hazards.filter(h => h.beacon_kind === 'suspicious').length} yellow, ` +
                `${hazards.filter(h => h.beacon_kind === 'report').length} purple)`,
            );

            set({ allHazards: hazards, isLoading: false });
            get().calculateZoneSafety();
        } catch (error) {
            console.error('Failed to fetch global hazards:', error);
            set({
                error: error instanceof Error ? error.message : 'Failed to fetch hazards',
                isLoading: false,
            });
        }
    },

    // Backward-compat alias: store the user location, then do a global fetch
    fetchNearbyHazards: async (lat: number, long: number, _radius?: number) => {
        set({ userLat: lat, userLong: long });
        await get().fetchAllHazards();
    },

    setUserLocation: (lat: number, long: number) => {
        set({ userLat: lat, userLong: long });
        get().calculateZoneSafety();
    },

    // ══════════════════════════════════════════════════════════════════════════
    // Realtime subscriptions (global — no radius filter)
    // ══════════════════════════════════════════════════════════════════════════
    subscribeToAlerts: () => {
        const channel = supabase
            .channel('mobile-alerts')
            // ── Red beacons ──────────────────────────────────────────
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'immediate_danger_logs' },
                payload => {
                    const d = payload.new;
                    if (d.is_active) {
                        const coords = parsePostGISPoint(d.coordinates);
                        if (coords) {
                            const hazard: HazardData = {
                                id: d.id,
                                coordinates: coords,
                                type: d.activity_type,
                                distance_meters: 0,
                                bearing_degrees: 0,
                                is_immediate: true,
                                detected_at: d.detected_at,
                                beacon_kind: 'immediate',
                            };
                            set(state => {
                                const updated = [hazard, ...state.allHazards];
                                return { allHazards: updated };
                            });
                            get().calculateZoneSafety();
                        }
                    }
                },
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'immediate_danger_logs' },
                payload => {
                    const d = payload.new;
                    const coords = parsePostGISPoint(d.coordinates);
                    set(state => {
                        if (!d.is_active) {
                            const filtered = state.allHazards.filter(h => h.id !== d.id);
                            return { allHazards: filtered };
                        }
                        if (coords) {
                            const idx = state.allHazards.findIndex(h => h.id === d.id);
                            if (idx >= 0) {
                                const updated = [...state.allHazards];
                                updated[idx] = { ...updated[idx], coordinates: coords, type: d.activity_type, detected_at: d.detected_at };
                                return { allHazards: updated };
                            }
                            const newList = [{
                                id: d.id, coordinates: coords, type: d.activity_type,
                                distance_meters: 0, bearing_degrees: 0, is_immediate: true,
                                detected_at: d.detected_at, beacon_kind: 'immediate' as BeaconKind,
                            }, ...state.allHazards];
                            return { allHazards: newList };
                        }
                        return state;
                    });
                    get().calculateZoneSafety();
                },
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'immediate_danger_logs' },
                payload => {
                    set(state => {
                        const filtered = state.allHazards.filter(h => h.id !== payload.old.id);
                        return { allHazards: filtered };
                    });
                    get().calculateZoneSafety();
                },
            )
            // ── Purple beacons (validated user-reported crimes) ──────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'user_reported_crimes' },
                payload => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const report = payload.new;

                        if (report.validation_status !== 'validated') {
                            // Remove if it was previously in the list
                            set(state => {
                                const filtered = state.allHazards.filter(h => h.id !== report.id);
                                return { allHazards: filtered };
                            });
                            get().calculateZoneSafety();
                            return;
                        }

                        // Parse PostGIS WKT coordinates
                        let lat: number | undefined;
                        let long: number | undefined;

                        if (typeof report.lat === 'number' && typeof report.long === 'number') {
                            lat = report.lat;
                            long = report.long;
                        } else {
                            const parsed = parsePostGISPoint(report.coordinates);
                            if (parsed) { lat = parsed.lat; long = parsed.long; }
                        }

                        if (lat && long && !isNaN(lat) && !isNaN(long)) {
                            set(state => {
                                const idx = state.allHazards.findIndex(h => h.id === report.id);
                                const newH: HazardData = {
                                    id: report.id,
                                    coordinates: { lat, long },
                                    type: report.crime_type || 'report',
                                    distance_meters: 0,
                                    bearing_degrees: 0,
                                    is_immediate: false,
                                    detected_at: report.reported_at,
                                    beacon_kind: 'report',
                                };
                                if (idx >= 0) {
                                    const updated = [...state.allHazards];
                                    updated[idx] = newH;
                                    return { allHazards: updated };
                                }
                                const newList = [newH, ...state.allHazards];
                                return { allHazards: newList };
                            });
                            get().calculateZoneSafety();
                        } else {
                            console.warn('[NightWalk] Validated report missing coordinates:', report.id);
                        }
                    }
                    if (payload.eventType === 'DELETE') {
                        set(state => {
                            const filtered = state.allHazards.filter(h => h.id !== payload.old.id);
                            return { allHazards: filtered };
                        });
                        get().calculateZoneSafety();
                    }
                },
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    },

    // ══════════════════════════════════════════════════════════════════════════
    // Safety score — computed from hazards within 1 km of user position
    // ══════════════════════════════════════════════════════════════════════════
    calculateZoneSafety: () => {
        const { allHazards, userLat, userLong } = get();

        if (allHazards.length === 0 || (userLat === 0 && userLong === 0)) {
            set({ zoneSafety: 100, nearbyCount: 0, nearbyHazards: [] });
            return;
        }

        let safetyScore = 100;
        let nearby = 0;
        const newlyNearby: HazardData[] = [];

        allHazards.forEach(hazard => {
            const dist = haversineMetres(
                userLat, userLong,
                hazard.coordinates.lat, hazard.coordinates.long,
            );
            if (dist > NEARBY_RADIUS_M) return; // outside 1 km — skip for safety calc

            nearby++;
            newlyNearby.push(hazard);
            const distanceFactor = Math.max(0, 1 - dist / NEARBY_RADIUS_M);
            const severity = hazard.is_immediate ? 35 : hazard.beacon_kind === 'report' ? 20 : 15;
            safetyScore -= severity * distanceFactor;
        });

        newlyNearby.sort(
            (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
        );

        set({ zoneSafety: Math.max(0, Math.round(safetyScore)), nearbyCount: nearby, nearbyHazards: newlyNearby });
    },
}));
