/**
 * NightWalk Web - Alert Store (Zustand)
 * Manages real-time alert state with Supabase Realtime subscriptions
 */
import { create } from 'zustand';
import { supabase, parsePostGISPoint } from '../lib/supabase';
import type { ImmediateDanger, SuspiciousLog } from '../lib/supabase';

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
            // Try using database functions first (if available), fallback to direct query
            let dangers: any[] = [];
            let suspicious: any[] = [];

            // Attempt to use RPC functions for better coordinate handling
            try {
                const { data: dangersRpc, error: dangersRpcError } = await supabase.rpc('get_immediate_dangers');
                if (!dangersRpcError && dangersRpc) {
                    dangers = dangersRpc;
                } else {
                    // Fallback to direct query
                    const { data: dangersData, error: dangerError } = await supabase
                        .from('immediate_danger_logs')
                        .select('*')
                        .eq('is_active', true)
                        .order('detected_at', { ascending: false })
                        .limit(100);
                    
                    if (dangerError) {
                        console.error('Error fetching immediate dangers:', dangerError);
                        throw dangerError;
                    }
                    dangers = dangersData || [];
                }
            } catch (rpcError) {
                // RPC function might not exist, use direct query
                console.warn('RPC function not available, using direct query:', rpcError);
                const { data: dangersData, error: dangerError } = await supabase
                    .from('immediate_danger_logs')
                    .select('*')
                    .eq('is_active', true)
                    .order('detected_at', { ascending: false })
                    .limit(100);
                
                if (dangerError) {
                    console.error('Error fetching immediate dangers:', dangerError);
                    throw dangerError;
                }
                dangers = dangersData || [];
            }

            try {
                const { data: suspiciousRpc, error: suspiciousRpcError } = await supabase.rpc('get_suspicious_logs');
                if (!suspiciousRpcError && suspiciousRpc) {
                    suspicious = suspiciousRpc;
                } else {
                    // Fallback to direct query
                    const { data: suspiciousData, error: suspiciousError } = await supabase
                        .from('suspicious_individual_logs')
                        .select('*')
                        .eq('status', 'pending')
                        .order('detected_at', { ascending: false })
                        .limit(100);
                    
                    if (suspiciousError) {
                        console.error('Error fetching suspicious logs:', suspiciousError);
                        throw suspiciousError;
                    }
                    suspicious = suspiciousData || [];
                }
            } catch (rpcError) {
                // RPC function might not exist, use direct query
                console.warn('RPC function not available, using direct query:', rpcError);
                const { data: suspiciousData, error: suspiciousError } = await supabase
                    .from('suspicious_individual_logs')
                    .select('*')
                    .eq('status', 'pending')
                    .order('detected_at', { ascending: false })
                    .limit(100);
                
                if (suspiciousError) {
                    console.error('Error fetching suspicious logs:', suspiciousError);
                    throw suspiciousError;
                }
                suspicious = suspiciousData || [];
            }

            // Parse coordinates for each record
            // If using RPC functions, lat/long are already extracted
            // Otherwise, parse from coordinates field
            const parsedDangers = (dangers || []).map(d => {
                // If lat/long already exist (from RPC function), use them
                if (typeof d.lat === 'number' && typeof d.long === 'number') {
                    return { ...d, lat: d.lat, long: d.long };
                }
                // Otherwise, parse from coordinates field
                const coords = parsePostGISPoint(d.coordinates);
                if (!coords) {
                    console.warn('Failed to parse coordinates for danger:', d.id, 'Raw coordinates:', d.coordinates);
                }
                return { ...d, lat: coords?.lat, long: coords?.long };
            });

            const parsedSuspicious = (suspicious || []).map(s => {
                // If lat/long already exist (from RPC function), use them
                if (typeof s.lat === 'number' && typeof s.long === 'number') {
                    return { ...s, lat: s.lat, long: s.long };
                }
                // Otherwise, parse from coordinates field
                const coords = parsePostGISPoint(s.coordinates);
                if (!coords) {
                    console.warn('Failed to parse coordinates for suspicious:', s.id, 'Raw coordinates:', s.coordinates);
                }
                return { ...s, lat: coords?.lat, long: coords?.long };
            });

            // Debug logging
            console.log('Fetched dangers:', parsedDangers.length, parsedDangers);
            console.log('Fetched suspicious:', parsedSuspicious.length, parsedSuspicious);

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
                    // Only add if active
                    if (newDanger.is_active) {
                        // Handle coordinates - may already be parsed or need parsing
                        let lat: number | undefined;
                        let long: number | undefined;
                        
                        if (typeof newDanger.lat === 'number' && typeof newDanger.long === 'number') {
                            // Already extracted (from RPC or view)
                            lat = newDanger.lat;
                            long = newDanger.long;
                        } else {
                            // Need to parse from coordinates field
                            const coords = parsePostGISPoint(newDanger.coordinates);
                            lat = coords?.lat;
                            long = coords?.long;
                            if (!coords) {
                                console.warn('Realtime: Failed to parse coordinates for new danger:', newDanger.id, 'Raw:', newDanger.coordinates);
                            }
                        }
                        
                        const parsed = { ...newDanger, lat, long };

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
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'immediate_danger_logs'
                },
                (payload) => {
                    const updatedDanger = payload.new as ImmediateDanger;
                    // Handle coordinates - may already be parsed or need parsing
                    let lat: number | undefined;
                    let long: number | undefined;
                    
                    if (typeof updatedDanger.lat === 'number' && typeof updatedDanger.long === 'number') {
                        lat = updatedDanger.lat;
                        long = updatedDanger.long;
                    } else {
                        const coords = parsePostGISPoint(updatedDanger.coordinates);
                        lat = coords?.lat;
                        long = coords?.long;
                    }
                    
                    const parsed = { ...updatedDanger, lat, long };

                    set((state) => {
                        // Remove if inactive, otherwise update
                        if (!updatedDanger.is_active) {
                            return {
                                immediateDangers: state.immediateDangers.filter(d => d.id !== updatedDanger.id)
                            };
                        }
                        // Update existing or add if not present
                        const existingIndex = state.immediateDangers.findIndex(d => d.id === updatedDanger.id);
                        if (existingIndex >= 0) {
                            const updated = [...state.immediateDangers];
                            updated[existingIndex] = parsed;
                            return { immediateDangers: updated };
                        }
                        return { immediateDangers: [parsed, ...state.immediateDangers] };
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'immediate_danger_logs'
                },
                (payload) => {
                    const deletedId = payload.old.id;
                    set((state) => ({
                        immediateDangers: state.immediateDangers.filter(d => d.id !== deletedId)
                    }));
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
                    // Only add if pending
                    if (newLog.status === 'pending') {
                        // Handle coordinates - may already be parsed or need parsing
                        let lat: number | undefined;
                        let long: number | undefined;
                        
                        if (typeof newLog.lat === 'number' && typeof newLog.long === 'number') {
                            lat = newLog.lat;
                            long = newLog.long;
                        } else {
                            const coords = parsePostGISPoint(newLog.coordinates);
                            lat = coords?.lat;
                            long = coords?.long;
                            if (!coords) {
                                console.warn('Realtime: Failed to parse coordinates for new suspicious:', newLog.id, 'Raw:', newLog.coordinates);
                            }
                        }
                        
                        const parsed = { ...newLog, lat, long };

                        set((state) => ({
                            suspiciousLogs: [parsed, ...state.suspiciousLogs]
                        }));
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'suspicious_individual_logs'
                },
                (payload) => {
                    const updatedLog = payload.new as SuspiciousLog;
                    // Handle coordinates - may already be parsed or need parsing
                    let lat: number | undefined;
                    let long: number | undefined;
                    
                    if (typeof updatedLog.lat === 'number' && typeof updatedLog.long === 'number') {
                        lat = updatedLog.lat;
                        long = updatedLog.long;
                    } else {
                        const coords = parsePostGISPoint(updatedLog.coordinates);
                        lat = coords?.lat;
                        long = coords?.long;
                    }
                    
                    const parsed = { ...updatedLog, lat, long };

                    set((state) => {
                        // Remove if not pending, otherwise update
                        if (updatedLog.status !== 'pending') {
                            return {
                                suspiciousLogs: state.suspiciousLogs.filter(s => s.id !== updatedLog.id)
                            };
                        }
                        // Update existing or add if not present
                        const existingIndex = state.suspiciousLogs.findIndex(s => s.id === updatedLog.id);
                        if (existingIndex >= 0) {
                            const updated = [...state.suspiciousLogs];
                            updated[existingIndex] = parsed;
                            return { suspiciousLogs: updated };
                        }
                        return { suspiciousLogs: [parsed, ...state.suspiciousLogs] };
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'suspicious_individual_logs'
                },
                (payload) => {
                    const deletedId = payload.old.id;
                    set((state) => ({
                        suspiciousLogs: state.suspiciousLogs.filter(s => s.id !== deletedId)
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
