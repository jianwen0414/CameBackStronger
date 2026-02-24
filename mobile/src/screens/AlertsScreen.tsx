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
    Animated,
} from 'react-native';
import { AlertTriangle, MapPin, Bell, ShieldAlert } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAlertStore } from '../store/useAlertStore';
import type { HazardData } from '../lib/supabase';

type AlertItem = HazardData;

export default function AlertsScreen() {
    const { nearbyHazards, fetchAllHazards, isLoading } = useAlertStore();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'immediate' | 'suspicious'>('all');

    const alerts = nearbyHazards;

    const fetchAlerts = async () => {
        setIsRefreshing(true);
        await fetchAllHazards();
        setIsRefreshing(false);
    };

    // Filter alerts
    const filteredAlerts = alerts.filter(alert => {
        if (filter === 'all') return true;
        return alert.beacon_kind === filter;
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
        const isImmediate = item.beacon_kind === 'immediate';
        const coords = item.coordinates;
        const activityType = item.type || 'suspicious';

        return (
            <TouchableOpacity
                style={[
                    styles.alertCard,
                    isImmediate ? styles.alertCardDanger : styles.alertCardNormal
                ]}
                activeOpacity={isImmediate ? 0.9 : 0.7}
            >
                {/* Icon */}
                <View
                    style={[
                        styles.alertIcon,
                        { backgroundColor: isImmediate ? 'rgba(255, 51, 102, 0.1)' : 'rgba(255, 255, 255, 0.05)' },
                    ]}
                >
                    {isImmediate ?
                        <ShieldAlert size={isImmediate ? 24 : 20} color="#FF3366" /> :
                        <AlertTriangle size={20} color="#A1A1AA" />
                    }
                </View>

                {/* Content */}
                <View style={styles.alertContent}>
                    <View style={styles.alertHeader}>
                        <Text style={[styles.alertType, isImmediate && styles.alertTypeDanger]}>
                            {isImmediate ? 'IMMEDIATE DANGER' : 'SUSPICIOUS ACTIVITY'}
                        </Text>
                        <Text style={styles.alertTime}>{formatTime(item.detected_at)}</Text>
                    </View>

                    <Text style={[styles.alertActivity, isImmediate && styles.alertActivityDanger]}>
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
                        refreshing={isLoading || isRefreshing}
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
        backgroundColor: '#09090B',
    },
    header: {
        padding: 24,
        paddingTop: 60, // Ensure clear of notch
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    headerTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: '#A1A1AA',
        marginTop: 6,
    },
    filterTabs: {
        flexDirection: 'row',
        padding: 16,
        gap: 8,
    },
    filterTab: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 20,
        backgroundColor: '#18181B',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    filterTabActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    filterTabText: {
        color: '#A1A1AA',
        fontSize: 13,
        fontWeight: '600',
    },
    filterTabTextActive: {
        color: '#FFFFFF',
    },
    list: {
        padding: 16,
        gap: 16,
        paddingBottom: 100, // accommodate flying tab bar
    },
    alertCard: {
        flexDirection: 'row',
        backgroundColor: '#18181B',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    alertCardNormal: {
        padding: 16,
    },
    alertCardDanger: {
        padding: 20, // larger padding for priority
        borderColor: 'rgba(255, 51, 102, 0.4)',
        backgroundColor: 'rgba(255, 51, 102, 0.05)',
        shadowColor: '#FF3366',
        shadowOpacity: 0.1,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
    },
    alertIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    alertContent: {
        flex: 1,
        justifyContent: 'center',
    },
    alertHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    alertType: {
        fontSize: 11,
        fontWeight: '700',
        color: '#A1A1AA',
        letterSpacing: 1,
    },
    alertTypeDanger: {
        color: '#FF3366',
    },
    alertTime: {
        fontSize: 12,
        color: '#606070',
    },
    alertActivity: {
        fontSize: 16,
        fontWeight: '600',
        color: '#E4E4E7',
        marginBottom: 8,
    },
    alertActivityDanger: {
        fontSize: 18,
        color: '#FFFFFF',
    },
    alertLocation: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    alertLocationText: {
        fontSize: 12,
        color: '#A1A1AA',
        fontFamily: 'monospace',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyText: {
        fontSize: 18,
        color: '#A1A1AA',
        marginTop: 16,
        fontWeight: '600',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#606070',
        marginTop: 4,
    },
});
