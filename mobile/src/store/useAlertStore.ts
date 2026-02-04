/**
 * NightWalk Mobile - Alert Store (Zustand)
 */
import { create } from 'zustand';
import Config from 'react-native-config';
import { supabase, HazardData, parsePostGISPoint } from '../lib/supabase';

const API_BASE_URL = (Config.API_BASE_URL || '').replace(/\/+$/, '');

interface AlertState {
    nearbyHazards: HazardData[];
    isLoading: boolean;
    error: string | null;
    zoneSafety: number;

    // Actions
    fetchNearbyHazards: (lat: number, long: number, radius?: number) => Promise<void>;
    subscribeToAlerts: () => () => void;
    calculateZoneSafety: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
    nearbyHazards: [],
    isLoading: false,
    error: null,
    zoneSafety: 100,

    fetchNearbyHazards: async (lat: number, long: number, radius = 500) => {
        set({ isLoading: true, error: null });

        try {
            // Try API first if available
            if (API_BASE_URL) {
                try {
                    const response = await fetch(
                        `${API_BASE_URL}/alerts/nearby?lat=${lat}&long=${long}&radius=${radius}`,
                    );

                    if (response.ok) {
                        const data = await response.json();
                        const hazards: HazardData[] = (data.hazards || []).map((h: any) => ({
                            ...h,
                            // Ensure coordinates are in correct format
                            coordinates: h.coordinates?.lat && h.coordinates?.long
                                ? { lat: h.coordinates.lat, long: h.coordinates.long }
                                : { lat: h.lat || 0, long: h.long || 0 },
                        })).filter((h: HazardData) => h.coordinates.lat && h.coordinates.long);

                        console.log('Fetched hazards from API:', hazards.length);
                        set({ nearbyHazards: hazards, isLoading: false });
                        get().calculateZoneSafety();
                        return;
                    }
                } catch (apiError) {
                    console.warn('API fetch failed, falling back to Supabase:', apiError);
                }
            }

            // Fallback: Fetch directly from Supabase using RPC functions
            console.log('Fetching hazards from Supabase...');
            
            // Fetch immediate dangers
            const { data: immediateDangers, error: dangerError } = await supabase.rpc(
                'find_immediate_dangers_nearby',
                {
                    query_lat: lat,
                    query_long: long,
                    radius_m: radius,
                }
            );

            // Fetch suspicious logs
            const { data: suspiciousLogs, error: suspiciousError } = await supabase.rpc(
                'find_suspicious_nearby',
                {
                    query_lat: lat,
                    query_long: long,
                    radius_m: radius,
                }
            );

            if (dangerError) {
                console.error('Error fetching immediate dangers:', dangerError);
            }
            if (suspiciousError) {
                console.error('Error fetching suspicious logs:', suspiciousError);
            }

            // Combine and format hazards
            const hazards: HazardData[] = [];

            // Process immediate dangers
            if (immediateDangers && Array.isArray(immediateDangers)) {
                immediateDangers.forEach((d: any) => {
                    // Ensure lat and long are valid numbers
                    const lat = typeof d.lat === 'number' ? d.lat : parseFloat(d.lat);
                    const long = typeof d.long === 'number' ? d.long : parseFloat(d.long);
                    
                    if (!isNaN(lat) && !isNaN(long) && lat !== 0 && long !== 0) {
                        hazards.push({
                            id: d.id,
                            coordinates: { lat, long },
                            type: d.activity_type || 'danger',
                            distance_meters: 0, // Will be calculated if needed
                            bearing_degrees: 0,
                            is_immediate: true,
                            detected_at: d.detected_at,
                        });
                    } else {
                        console.warn('Invalid coordinates for danger:', d.id, 'lat:', d.lat, 'long:', d.long);
                    }
                });
            }

            // Process suspicious logs
            if (suspiciousLogs && Array.isArray(suspiciousLogs)) {
                suspiciousLogs.forEach((s: any) => {
                    // Ensure lat and long are valid numbers
                    const lat = typeof s.lat === 'number' ? s.lat : parseFloat(s.lat);
                    const long = typeof s.long === 'number' ? s.long : parseFloat(s.long);
                    
                    if (!isNaN(lat) && !isNaN(long) && lat !== 0 && long !== 0) {
                        hazards.push({
                            id: s.id,
                            coordinates: { lat, long },
                            type: 'suspicious',
                            distance_meters: 0,
                            bearing_degrees: 0,
                            is_immediate: false,
                            detected_at: s.detected_at,
                        });
                    } else {
                        console.warn('Invalid coordinates for suspicious:', s.id, 'lat:', s.lat, 'long:', s.long);
                    }
                });
            }

            console.log('Fetched hazards from Supabase:', hazards.length);
            if (hazards.length > 0) {
                console.log('Sample hazard coordinates:', hazards[0].coordinates);
                console.log('All hazard coordinates:', hazards.map(h => ({ 
                    id: h.id, 
                    lat: h.coordinates.lat, 
                    long: h.coordinates.long,
                    isValid: !isNaN(h.coordinates.lat) && !isNaN(h.coordinates.long)
                })));
            }
            set({ nearbyHazards: hazards, isLoading: false });
            get().calculateZoneSafety();
        } catch (error) {
            console.error('Failed to fetch hazards:', error);
            set({
                error: error instanceof Error ? error.message : 'Failed to fetch hazards',
                isLoading: false,
            });
        }
    },

    subscribeToAlerts: () => {
        const channel = supabase
            .channel('mobile-alerts')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'immediate_danger_logs',
                },
                payload => {
                    const newDanger = payload.new;
                    // Only add if active
                    if (newDanger.is_active) {
                        const coords = parsePostGISPoint(newDanger.coordinates);

                        if (coords) {
                            const hazard: HazardData = {
                                id: newDanger.id,
                                coordinates: coords,
                                type: newDanger.activity_type,
                                distance_meters: 0, // Will be calculated on next fetch
                                bearing_degrees: 0,
                                is_immediate: true,
                                detected_at: newDanger.detected_at,
                            };

                            set(state => ({
                                nearbyHazards: [hazard, ...state.nearbyHazards],
                            }));
                            get().calculateZoneSafety();
                        }
                    }
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'immediate_danger_logs',
                },
                payload => {
                    const updatedDanger = payload.new;
                    const coords = parsePostGISPoint(updatedDanger.coordinates);

                    set(state => {
                        // Remove if inactive
                        if (!updatedDanger.is_active) {
                            return {
                                nearbyHazards: state.nearbyHazards.filter(h => h.id !== updatedDanger.id),
                            };
                        }
                        // Update existing if coords available
                        if (coords) {
                            const existingIndex = state.nearbyHazards.findIndex(h => h.id === updatedDanger.id);
                            if (existingIndex >= 0) {
                                const updated = [...state.nearbyHazards];
                                updated[existingIndex] = {
                                    ...updated[existingIndex],
                                    coordinates: coords,
                                    type: updatedDanger.activity_type,
                                    detected_at: updatedDanger.detected_at,
                                };
                                return { nearbyHazards: updated };
                            }
                            // Add if not present
                            const hazard: HazardData = {
                                id: updatedDanger.id,
                                coordinates: coords,
                                type: updatedDanger.activity_type,
                                distance_meters: 0,
                                bearing_degrees: 0,
                                is_immediate: true,
                                detected_at: updatedDanger.detected_at,
                            };
                            return { nearbyHazards: [hazard, ...state.nearbyHazards] };
                        }
                        return state;
                    });
                    get().calculateZoneSafety();
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'immediate_danger_logs',
                },
                payload => {
                    const deletedId = payload.old.id;
                    set(state => ({
                        nearbyHazards: state.nearbyHazards.filter(h => h.id !== deletedId),
                    }));
                    get().calculateZoneSafety();
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    calculateZoneSafety: () => {
        const { nearbyHazards } = get();

        if (nearbyHazards.length === 0) {
            set({ zoneSafety: 100 });
            return;
        }

        // Calculate safety based on nearby hazards
        // More severe penalties for immediate dangers
        let safetyScore = 100;

        nearbyHazards.forEach(hazard => {
            // Use distance if available, otherwise assume close (worst case)
            const distance = hazard.distance_meters || 0;
            const distanceFactor = Math.max(0, 1 - distance / 500);
            
            // Immediate dangers are more severe
            const severity = hazard.is_immediate ? 35 : 15;
            safetyScore -= severity * distanceFactor;
        });

        set({ zoneSafety: Math.max(0, Math.round(safetyScore)) });
    },
}));
