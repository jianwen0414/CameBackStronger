/**
 * NightWalk Web - Alert Store (Zustand)
 * Manages real-time alert state with Supabase Realtime subscriptions
 * Supports 4 beacon types: red (danger), yellow (suspicious), blue (CCTV), purple (user reports)
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase, parsePostGISPoint } from '../lib/supabase';
import type { ImmediateDanger, SuspiciousLog, CCTVCamera, UserReportedCrime, BeaconType } from '../lib/supabase';

// ============================================================================

interface BeaconFilters {
    red: boolean;
    yellow: boolean;
    blue: boolean;
    purple: boolean;
}

interface AlertState {
    immediateDangers: ImmediateDanger[];
    suspiciousLogs: SuspiciousLog[];
    cctvCameras: CCTVCamera[];
    userReportedCrimes: UserReportedCrime[];
    isLoading: boolean;
    error: string | null;
    selectedAlert: ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime | null;
    selectedAlertType: BeaconType | null;
    isModalOpen: boolean;
    isCCTVStreamOpen: boolean;
    trackingPersonId: number | null;

    // Beacon filters
    beaconFilters: BeaconFilters;

    // Actions
    fetchAlerts: () => Promise<void>;
    fetchCCTVCameras: () => Promise<void>;
    fetchUserReportedCrimes: () => Promise<void>;
    subscribeToRealtime: () => () => void;
    selectAlert: (alert: ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime | null, type?: BeaconType) => void;
    openModal: () => void;
    closeModal: () => void;
    openCCTVStream: () => void;
    closeCCTVStream: () => void;
    openTracking: (personId: number) => void;
    closeTracking: () => void;
    setBeaconFilter: (type: BeaconType, enabled: boolean) => void;
    toggleBeaconFilter: (type: BeaconType) => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
    immediateDangers: [],
    suspiciousLogs: [],
    cctvCameras: [],
    userReportedCrimes: [],
    isLoading: false,
    error: null,
    selectedAlert: null,
    selectedAlertType: null,
    isModalOpen: false,
    isCCTVStreamOpen: false,
    trackingPersonId: null,

    beaconFilters: {
        red: true,
        yellow: true,
        blue: true,
        purple: true,
    },

    fetchAlerts: async () => {
        set({ isLoading: true, error: null });

        try {
            let dangers: any[] = [];
            let suspicious: any[] = [];

            // Attempt to use RPC functions for better coordinate handling
            try {
                const { data: dangersRpc, error: dangersRpcError } = await supabase.rpc('get_immediate_dangers');
                if (!dangersRpcError && dangersRpc) {
                    dangers = dangersRpc;
                } else {
                    const { data: dangersData, error: dangerError } = await supabase
                        .from('immediate_danger_logs')
                        .select('*')
                        .eq('is_active', true)
                        .order('detected_at', { ascending: false })
                        .limit(100);
                    if (dangerError) throw dangerError;
                    dangers = dangersData || [];
                }
            } catch (rpcError) {
                const { data: dangersData, error: dangerError } = await supabase
                    .from('immediate_danger_logs')
                    .select('*')
                    .eq('is_active', true)
                    .order('detected_at', { ascending: false })
                    .limit(100);
                if (dangerError) throw dangerError;
                dangers = dangersData || [];
            }

            try {
                const { data: suspiciousRpc, error: suspiciousRpcError } = await supabase.rpc('get_suspicious_logs');
                if (!suspiciousRpcError && suspiciousRpc) {
                    suspicious = suspiciousRpc;
                } else {
                    const { data: suspiciousData, error: suspiciousError } = await supabase
                        .from('suspicious_individual_logs')
                        .select('*')
                        .eq('status', 'pending')
                        .order('detected_at', { ascending: false })
                        .limit(100);
                    if (suspiciousError) throw suspiciousError;
                    suspicious = suspiciousData || [];
                }
            } catch (rpcError) {
                const { data: suspiciousData, error: suspiciousError } = await supabase
                    .from('suspicious_individual_logs')
                    .select('*')
                    .eq('status', 'pending')
                    .order('detected_at', { ascending: false })
                    .limit(100);
                if (suspiciousError) throw suspiciousError;
                suspicious = suspiciousData || [];
            }

            // Parse coordinates
            const parsedDangers = (dangers || []).map(d => {
                if (typeof d.lat === 'number' && typeof d.long === 'number') {
                    return { ...d, lat: d.lat, long: d.long };
                }
                const coords = parsePostGISPoint(d.coordinates);
                return { ...d, lat: coords?.lat, long: coords?.long };
            });

            const parsedSuspicious = (suspicious || []).map(s => {
                if (typeof s.lat === 'number' && typeof s.long === 'number') {
                    return { ...s, lat: s.lat, long: s.long };
                }
                const coords = parsePostGISPoint(s.coordinates);
                return { ...s, lat: coords?.lat, long: coords?.long };
            });

            set({
                immediateDangers: parsedDangers,
                suspiciousLogs: parsedSuspicious,
                isLoading: false,
                error: null
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch alerts';
            console.error('Error fetching alerts:', error);
            set({
                immediateDangers: [],
                suspiciousLogs: [],
                error: errorMessage,
                isLoading: false
            });
        }
    },

    fetchCCTVCameras: async () => {
        try {
            // Try RPC first
            let cameras: CCTVCamera[] = [];
            try {
                const { data, error } = await supabase.rpc('get_all_cctv');
                if (!error && data) {
                    cameras = data.map((c: any) => ({
                        id: c.id,
                        camera_name: c.camera_name,
                        location_name: c.location_name,
                        lat: c.lat,
                        long: c.long,
                        altitude: c.altitude,
                        stream_url: c.stream_url,
                        is_active: c.is_active,
                        last_heartbeat: c.last_heartbeat,
                    }));
                }
            } catch {
                // Fallback to direct query
                const { data, error } = await supabase
                    .from('cctv_cameras')
                    .select('*')
                    .eq('is_active', true)
                    .order('camera_name');

                if (!error && data) {
                    cameras = data.map((c: any) => {
                        const coords = parsePostGISPoint(c.coordinates);
                        return {
                            id: c.id,
                            camera_name: c.camera_name,
                            location_name: c.location_name,
                            lat: coords?.lat || 0,
                            long: coords?.long || 0,
                            altitude: c.altitude,
                            stream_url: c.stream_url,
                            is_active: c.is_active,
                            last_heartbeat: c.last_heartbeat,
                        };
                    });
                }
            }
            set({ cctvCameras: cameras });
        } catch (error) {
            console.error('Error fetching CCTV cameras:', error);
        }
    },

    fetchUserReportedCrimes: async () => {
        try {
            let reports: UserReportedCrime[] = [];
            try {
                const { data, error } = await supabase.rpc('get_all_reported_crimes');
                if (!error && data) {
                    reports = data.map((r: any) => ({
                        id: r.id,
                        reporter_id: r.reporter_id,
                        lat: r.lat,
                        long: r.long,
                        crime_type: r.crime_type,
                        description: r.description,
                        evidence_video_url: r.evidence_video_url,
                        classified_crime_type: r.classified_crime_type,
                        classification_confidence: r.classification_confidence,
                        gemini_analysis: r.gemini_analysis,
                        gemini_justification: r.gemini_justification,
                        validation_status: r.validation_status,
                        reported_at: r.reported_at,
                    }));
                }
            } catch {
                // Fallback to direct query
                const { data, error } = await supabase
                    .from('user_reported_crimes')
                    .select('*')
                    .order('reported_at', { ascending: false })
                    .limit(100);

                if (!error && data) {
                    reports = data.map((r: any) => {
                        const coords = parsePostGISPoint(r.coordinates);
                        return {
                            id: r.id,
                            reporter_id: r.reporter_id,
                            lat: coords?.lat || 0,
                            long: coords?.long || 0,
                            crime_type: r.crime_type,
                            description: r.description,
                            evidence_video_url: r.evidence_video_url,
                            classified_crime_type: r.classified_crime_type,
                            classification_confidence: r.classification_confidence,
                            gemini_analysis: r.gemini_analysis,
                            gemini_justification: r.gemini_justification,
                            validation_status: r.validation_status,
                            reported_at: r.reported_at,
                        };
                    });
                }
            }
            set({ userReportedCrimes: reports });
        } catch (error) {
            console.error('Error fetching user reported crimes:', error);
        }
    },

    subscribeToRealtime: () => {
        const { fetchAlerts, fetchUserReportedCrimes, fetchCCTVCameras } = get();

        // Subscribe to immediate_danger_logs
        // On any change, re-fetch via RPC so coordinates are properly extracted
        const dangerChannel = supabase
            .channel('immediate-dangers')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'immediate_danger_logs' },
                (payload) => {
                    // Re-fetch all dangers via RPC for correct lat/long
                    fetchAlerts();

                    // Toast notification on INSERT
                    if (payload.eventType === 'INSERT') {
                        const newDanger = payload.new as any;
                        const activityType = (newDanger.activity_type || 'UNKNOWN').toUpperCase();
                        const locationId = newDanger.location_id || '';
                        toast.error(`🚨 ${activityType} DETECTED`, {
                            description: locationId ? `Location: ${locationId}` : 'Immediate danger detected',
                            duration: 8000,
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
                { event: '*', schema: 'public', table: 'suspicious_individual_logs' },
                () => {
                    fetchAlerts();
                }
            )
            .subscribe();

        // Subscribe to user_reported_crimes
        const reportsChannel = supabase
            .channel('user-reports')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'user_reported_crimes' },
                () => {
                    fetchUserReportedCrimes();
                }
            )
            .subscribe();

        // Subscribe to cctv_cameras
        const cctvChannel = supabase
            .channel('cctv-cameras')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'cctv_cameras' },
                () => {
                    fetchCCTVCameras();
                }
            )
            .subscribe();

        // Return cleanup function
        return () => {
            supabase.removeChannel(dangerChannel);
            supabase.removeChannel(suspiciousChannel);
            supabase.removeChannel(reportsChannel);
            supabase.removeChannel(cctvChannel);
        };
    },

    selectAlert: (alert, type) => set({
        selectedAlert: alert,
        selectedAlertType: type || null
    }),
    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false, selectedAlert: null, selectedAlertType: null, isCCTVStreamOpen: false }),
    openCCTVStream: () => set({ isCCTVStreamOpen: true }),
    closeCCTVStream: () => set({ isCCTVStreamOpen: false }),
    openTracking: (personId) => set({ trackingPersonId: personId, isModalOpen: false }),
    closeTracking: () => set({ trackingPersonId: null }),
    setBeaconFilter: (type, enabled) => set((state) => ({
        beaconFilters: { ...state.beaconFilters, [type]: enabled }
    })),
    toggleBeaconFilter: (type) => set((state) => ({
        beaconFilters: { ...state.beaconFilters, [type]: !state.beaconFilters[type] }
    })),
}));
