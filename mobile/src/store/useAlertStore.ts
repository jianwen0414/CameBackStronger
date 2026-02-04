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
            if (!API_BASE_URL) {
                throw new Error('API_BASE_URL is not set');
            }
            const response = await fetch(
                `${API_BASE_URL}/alerts/nearby?lat=${lat}&long=${long}&radius=${radius}`,
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const hazards: HazardData[] = data.hazards || [];

            set({ nearbyHazards: hazards, isLoading: false });
            get().calculateZoneSafety();
        } catch (error) {
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
        let safetyScore = 100;

        nearbyHazards.forEach(hazard => {
            const distanceFactor = Math.max(0, 1 - hazard.distance_meters / 500);
            const severity = hazard.is_immediate ? 30 : 10;
            safetyScore -= severity * distanceFactor;
        });

        set({ zoneSafety: Math.max(0, Math.round(safetyScore)) });
    },
}));
