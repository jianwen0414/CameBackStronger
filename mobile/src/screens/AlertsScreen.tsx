/**
 * NightWalk Mobile - Alerts Screen (Tab 3)
 * Real-time alerts with Supabase subscription
 */
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { AlertTriangle, Clock, MapPin, Bell, CheckCircle } from 'lucide-react-native';
import { supabase, ImmediateDanger, SuspiciousLog, parsePostGISPoint } from '../lib/supabase';

type AlertItem = (ImmediateDanger | SuspiciousLog) & {
    alertType: 'immediate' | 'suspicious';
};

export default function AlertsScreen() {
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'immediate' | 'suspicious'>('all');

    // Fetch alerts
    const fetchAlerts = async () => {
        setIsRefreshing(true);

        try {
            // Fetch immediate dangers
            const { data: dangers, error: dangerError } = await supabase
                .from('immediate_danger_logs')
                .select('*')
                .eq('is_active', true)
                .order('detected_at', { ascending: false })
                .limit(50);

            if (dangerError) {
                console.error('Error fetching immediate dangers:', dangerError);
                throw dangerError;
            }

            // Fetch suspicious logs
            const { data: suspicious, error: suspiciousError } = await supabase
                .from('suspicious_individual_logs')
                .select('*')
                .order('detected_at', { ascending: false })
                .limit(50);

            if (suspiciousError) {
                console.error('Error fetching suspicious logs:', suspiciousError);
                throw suspiciousError;
            }

            const allAlerts: AlertItem[] = [
                ...(dangers || []).map(d => ({ ...d, alertType: 'immediate' as const })),
                ...(suspicious || []).map(s => ({ ...s, alertType: 'suspicious' as const })),
            ].sort(
                (a, b) =>
                    new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
            );

            setAlerts(allAlerts);
        } catch (error) {
            console.error('Failed to fetch alerts:', error);
            // On error, set empty array to show empty state
            setAlerts([]);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    // Subscribe to real-time updates
    useEffect(() => {
        const channel = supabase
            .channel('alerts-screen')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'immediate_danger_logs',
                },
                payload => {
                    const newAlert = {
                        ...payload.new,
                        alertType: 'immediate' as const,
                    } as AlertItem;
                    // Only add if active
                    if (newAlert.is_active) {
                        setAlerts(prev => [newAlert, ...prev]);
                        // Show local notification would go here
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
                    const updatedAlert = {
                        ...payload.new,
                        alertType: 'immediate' as const,
                    } as AlertItem;
                    setAlerts(prev => {
                        if (!updatedAlert.is_active) {
                            return prev.filter(a => a.id !== updatedAlert.id);
                        }
                        const existingIndex = prev.findIndex(a => a.id === updatedAlert.id);
                        if (existingIndex >= 0) {
                            const updated = [...prev];
                            updated[existingIndex] = updatedAlert;
                            return updated;
                        }
                        return [updatedAlert, ...prev];
                    });
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
                    setAlerts(prev => prev.filter(a => a.id !== deletedId));
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'suspicious_individual_logs',
                },
                payload => {
                    const newAlert = {
                        ...payload.new,
                        alertType: 'suspicious' as const,
                    } as AlertItem;
                    setAlerts(prev => [newAlert, ...prev]);
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'suspicious_individual_logs',
                },
                payload => {
                    const updatedAlert = {
                        ...payload.new,
                        alertType: 'suspicious' as const,
                    } as AlertItem;
                    setAlerts(prev => {
                        // Remove if status changed from pending
                        if (updatedAlert.status !== 'pending') {
                            return prev.filter(a => a.id !== updatedAlert.id);
                        }
                        const existingIndex = prev.findIndex(a => a.id === updatedAlert.id);
                        if (existingIndex >= 0) {
                            const updated = [...prev];
                            updated[existingIndex] = updatedAlert;
                            return updated;
                        }
                        return [updatedAlert, ...prev];
                    });
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'suspicious_individual_logs',
                },
                payload => {
                    const deletedId = payload.old.id;
                    setAlerts(prev => prev.filter(a => a.id !== deletedId));
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Filter alerts
    const filteredAlerts = alerts.filter(alert => {
        if (filter === 'all') return true;
        return alert.alertType === filter;
    });

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    };

    const renderAlert = ({ item }: { item: AlertItem }) => {
        const isImmediate = item.alertType === 'immediate';
        const coords = parsePostGISPoint(item.coordinates);
        const activityType = 'activity_type' in item ? item.activity_type : 'suspicious';

        return (
            <TouchableOpacity
                style={[styles.alertCard, isImmediate && styles.alertCardDanger]}
                activeOpacity={0.7}
            >
                {/* Icon */}
                <View
                    style={[
                        styles.alertIcon,
                        { backgroundColor: isImmediate ? 'rgba(255, 0, 64, 0.2)' : 'rgba(255, 204, 0, 0.2)' },
                    ]}
                >
                    <AlertTriangle size={20} color={isImmediate ? '#ff0040' : '#ffcc00'} />
                </View>

                {/* Content */}
                <View style={styles.alertContent}>
                    <View style={styles.alertHeader}>
                        <Text style={styles.alertType}>
                            {isImmediate ? 'IMMEDIATE DANGER' : 'SUSPICIOUS ACTIVITY'}
                        </Text>
                        <Text style={styles.alertTime}>{formatTime(item.detected_at)}</Text>
                    </View>

                    <Text style={styles.alertActivity}>
                        {activityType.charAt(0).toUpperCase() + activityType.slice(1)} detected
                    </Text>

                    {coords && (
                        <View style={styles.alertLocation}>
                            <MapPin size={12} color="#606070" />
                            <Text style={styles.alertLocationText}>
                                {coords.lat.toFixed(4)}, {coords.long.toFixed(4)}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Status indicator */}
                <View style={styles.alertStatus}>
                    {'status' in item && item.status === 'resolved' ? (
                        <CheckCircle size={16} color="#00ff88" />
                    ) : (
                        <View style={[styles.statusDot, isImmediate && styles.statusDotDanger]} />
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitle}>
                    <Bell size={24} color="#00f5ff" />
                    <Text style={styles.title}>Alerts</Text>
                </View>
                <Text style={styles.subtitle}>Real-time safety notifications</Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterTabs}>
                {(['all', 'immediate', 'suspicious'] as const).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterTab, filter === f && styles.filterTabActive]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Alerts List */}
            <FlatList
                data={filteredAlerts}
                renderItem={renderAlert}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={fetchAlerts}
                        tintColor="#00f5ff"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Bell size={48} color="#606070" />
                        <Text style={styles.emptyText}>No alerts in your area</Text>
                        <Text style={styles.emptySubtext}>Stay safe!</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0f',
    },
    header: {
        padding: 20,
        paddingTop: 40,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 14,
        color: '#606070',
        marginTop: 4,
    },
    filterTabs: {
        flexDirection: 'row',
        padding: 12,
        gap: 8,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(26, 26, 37, 0.8)',
        alignItems: 'center',
    },
    filterTabActive: {
        backgroundColor: 'rgba(0, 245, 255, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
    },
    filterTabText: {
        color: '#606070',
        fontSize: 13,
        fontWeight: '600',
    },
    filterTabTextActive: {
        color: '#00f5ff',
    },
    list: {
        padding: 12,
        gap: 12,
    },
    alertCard: {
        flexDirection: 'row',
        backgroundColor: 'rgba(26, 26, 37, 0.8)',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 12,
    },
    alertCardDanger: {
        borderColor: 'rgba(255, 0, 64, 0.4)',
        backgroundColor: 'rgba(255, 0, 64, 0.05)',
    },
    alertIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    alertContent: {
        flex: 1,
    },
    alertHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    alertType: {
        fontSize: 10,
        fontWeight: '700',
        color: '#a0a0b0',
        letterSpacing: 1,
    },
    alertTime: {
        fontSize: 11,
        color: '#606070',
    },
    alertActivity: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 6,
    },
    alertLocation: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    alertLocationText: {
        fontSize: 11,
        color: '#606070',
        fontFamily: 'monospace',
    },
    alertStatus: {
        justifyContent: 'center',
        paddingLeft: 12,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ffcc00',
    },
    statusDotDanger: {
        backgroundColor: '#ff0040',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyText: {
        fontSize: 18,
        color: '#606070',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#00ff88',
        marginTop: 4,
    },
});
