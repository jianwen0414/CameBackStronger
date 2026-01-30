/**
 * NightWalk Web - Alert Store (Zustand)
 * Manages real-time alert state with Supabase Realtime subscriptions
 */
import { create } from 'zustand';
import { supabase, parsePostGISPoint } from '../lib/supabase';
import type { ImmediateDanger, SuspiciousLog } from '../lib/supabase';

// ============================================================================
// MOCK DATA FOR DEVELOPMENT/TESTING
// These will be used when Supabase returns empty results or on connection error
// ============================================================================

const MOCK_IMMEDIATE_DANGERS: ImmediateDanger[] = [
    {
        id: 'mock-danger-1',
        coordinates: 'POINT(101.653568 3.120503)',
        activity_type: 'fight',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-fight.mp4',
        is_active: true,
        detected_at: new Date().toISOString(),
        lat: 3.120503,
        long: 101.653568
    },
    {
        id: 'mock-danger-2',
        coordinates: 'POINT(101.654200 3.121100)',
        activity_type: 'weapon',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-weapon.mp4',
        is_active: true,
        detected_at: new Date(Date.now() - 300000).toISOString(), // 5 min ago
        lat: 3.121100,
        long: 101.654200
    },
    {
        id: 'mock-danger-3',
        coordinates: 'POINT(101.652800 3.119800)',
        activity_type: 'robbery',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-robbery.mp4',
        is_active: true,
        detected_at: new Date(Date.now() - 600000).toISOString(), // 10 min ago
        lat: 3.119800,
        long: 101.652800
    }
];

const MOCK_SUSPICIOUS_LOGS: SuspiciousLog[] = [
    {
        id: 'mock-suspicious-1',
        coordinates: 'POINT(101.654800 3.120200)',
        location_id: 'zone-a',
        person_id_hash: 'hash-001',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-1.mp4',
        status: 'pending',
        detected_at: new Date(Date.now() - 120000).toISOString(), // 2 min ago
        lat: 3.120200,
        long: 101.654800
    },
    {
        id: 'mock-suspicious-2',
        coordinates: 'POINT(101.652500 3.121500)',
        location_id: 'zone-b',
        person_id_hash: 'hash-002',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-2.mp4',
        status: 'pending',
        detected_at: new Date(Date.now() - 240000).toISOString(), // 4 min ago
        lat: 3.121500,
        long: 101.652500
    },
    {
        id: 'mock-suspicious-3',
        coordinates: 'POINT(101.653100 3.118900)',
        location_id: 'zone-c',
        person_id_hash: 'hash-003',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-3.mp4',
        status: 'pending',
        detected_at: new Date(Date.now() - 480000).toISOString(), // 8 min ago
        lat: 3.118900,
        long: 101.653100
    },
    {
        id: 'mock-suspicious-4',
        coordinates: 'POINT(101.655200 3.119500)',
        location_id: 'zone-d',
        person_id_hash: 'hash-004',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-4.mp4',
        status: 'pending',
        detected_at: new Date(Date.now() - 720000).toISOString(), // 12 min ago
        lat: 3.119500,
        long: 101.655200
    },
    {
        id: 'mock-suspicious-5',
        coordinates: 'POINT(101.651800 3.120800)',
        location_id: 'zone-e',
        person_id_hash: 'hash-005',
        evidence_video_url: 'https://storage.googleapis.com/nightwalk-evidence/mock-loitering-5.mp4',
        status: 'pending',
        detected_at: new Date(Date.now() - 900000).toISOString(), // 15 min ago
        lat: 3.120800,
        long: 101.651800
    }
];

// ============================================================================

interface AlertState {
    immediateDangers: ImmediateDanger[];
    suspiciousLogs: SuspiciousLog[];
    isLoading: boolean;
    error: string | null;
    selectedAlert: ImmediateDanger | SuspiciousLog | null;
    isModalOpen: boolean;

    // Actions
    fetchAlerts: () => Promise<void>;
    subscribeToRealtime: () => () => void;
    selectAlert: (alert: ImmediateDanger | SuspiciousLog | null) => void;
    openModal: () => void;
    closeModal: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
    immediateDangers: [],
    suspiciousLogs: [],
    isLoading: false,
    error: null,
    selectedAlert: null,
    isModalOpen: false,

    fetchAlerts: async () => {
        set({ isLoading: true, error: null });

        try {
            // Fetch immediate dangers
            const { data: dangers, error: dangerError } = await supabase
                .from('immediate_danger_logs')
                .select('*')
                .eq('is_active', true)
                .order('detected_at', { ascending: false })
                .limit(100);

            if (dangerError) throw dangerError;

            // Fetch suspicious logs
            const { data: suspicious, error: suspiciousError } = await supabase
                .from('suspicious_individual_logs')
                .select('*')
                .eq('status', 'pending')
                .order('detected_at', { ascending: false })
                .limit(100);

            if (suspiciousError) throw suspiciousError;

            // Parse coordinates for each record
            const parsedDangers = (dangers || []).map(d => {
                const coords = parsePostGISPoint(d.coordinates);
                return { ...d, lat: coords?.lat, long: coords?.long };
            });

            const parsedSuspicious = (suspicious || []).map(s => {
                const coords = parsePostGISPoint(s.coordinates);
                return { ...s, lat: coords?.lat, long: coords?.long };
            });

            // Use mock data if database returns empty (for development/testing)
            const finalDangers = parsedDangers.length > 0 ? parsedDangers : MOCK_IMMEDIATE_DANGERS;
            const finalSuspicious = parsedSuspicious.length > 0 ? parsedSuspicious : MOCK_SUSPICIOUS_LOGS;

            set({
                immediateDangers: finalDangers,
                suspiciousLogs: finalSuspicious,
                isLoading: false
            });
        } catch (error) {
            // On error (e.g., no Supabase connection), use mock data
            console.warn('Using mock data due to error:', error);
            set({
                immediateDangers: MOCK_IMMEDIATE_DANGERS,
                suspiciousLogs: MOCK_SUSPICIOUS_LOGS,
                error: null,
                isLoading: false
            });
        }
    },

    subscribeToRealtime: () => {
        // Subscribe to immediate_danger_logs
        const dangerChannel = supabase
            .channel('immediate-dangers')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'immediate_danger_logs'
                },
                (payload) => {
                    const newDanger = payload.new as ImmediateDanger;
                    const coords = parsePostGISPoint(newDanger.coordinates);
                    const parsed = { ...newDanger, lat: coords?.lat, long: coords?.long };

                    set((state) => ({
                        immediateDangers: [parsed, ...state.immediateDangers]
                    }));

                    // Show notification (browser notification if permitted)
                    if (Notification.permission === 'granted') {
                        new Notification('🚨 IMMEDIATE DANGER DETECTED', {
                            body: `${newDanger.activity_type.toUpperCase()} detected at coordinates`,
                            icon: '/alert-icon.png'
                        });
                    }
                }
            )
            .subscribe();

        // Subscribe to suspicious_individual_logs
        const suspiciousChannel = supabase
            .channel('suspicious-logs')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'suspicious_individual_logs'
                },
                (payload) => {
                    const newLog = payload.new as SuspiciousLog;
                    const coords = parsePostGISPoint(newLog.coordinates);
                    const parsed = { ...newLog, lat: coords?.lat, long: coords?.long };

                    set((state) => ({
                        suspiciousLogs: [parsed, ...state.suspiciousLogs]
                    }));
                }
            )
            .subscribe();

        // Return cleanup function
        return () => {
            supabase.removeChannel(dangerChannel);
            supabase.removeChannel(suspiciousChannel);
        };
    },

    selectAlert: (alert) => set({ selectedAlert: alert }),
    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false, selectedAlert: null })
}));
