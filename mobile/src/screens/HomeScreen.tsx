import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { MapPin, Scan, ShieldAlert, AlertTriangle, ChevronRight } from 'lucide-react-native';

export default function HomeScreen({ navigation }: any) {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Good Evening</Text>
                    <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                </View>
                <TouchableOpacity style={styles.profileBtn}>
                    <Text style={styles.profileInitial}>J</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Hero Section */}
                <TouchableOpacity
                    style={styles.heroCard}
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('Report')}
                >
                    <View style={styles.heroContent}>
                        <View style={styles.heroIconWrapper}>
                            <ShieldAlert size={28} color="#FF3366" />
                        </View>
                        <View style={styles.heroTextContent}>
                            <Text style={styles.heroTitle}>Report an Incident</Text>
                            <Text style={styles.heroSubtitle}>Submit evidence for AI validation immediately.</Text>
                        </View>
                        <ChevronRight size={24} color="#888" />
                    </View>
                </TouchableOpacity>

                {/* Quick Access */}
                <Text style={styles.sectionTitle}>Quick Access</Text>
                <View style={styles.quickAccessRow}>
                    <TouchableOpacity
                        style={styles.quickCard}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Scanner')}
                    >
                        <View style={[styles.iconWrapper, { backgroundColor: 'rgba(0, 245, 255, 0.1)' }]}>
                            <Scan size={24} color="#00f5ff" />
                        </View>
                        <Text style={styles.quickCardTitle}>Scanner</Text>
                        <Text style={styles.quickCardSub}>AR Overlay</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.quickCard}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Map')}
                    >
                        <View style={[styles.iconWrapper, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                            <MapPin size={24} color="#A855F7" />
                        </View>
                        <Text style={styles.quickCardTitle}>City Map</Text>
                        <Text style={styles.quickCardSub}>Live Beacons</Text>
                    </TouchableOpacity>
                </View>

                {/* Recent Activity Dummy Data for now until we hook up the backend */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Context</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Alerts')}>
                        <Text style={styles.viewAllText}>View All</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.activityList}>
                    <View style={[styles.activityCard, styles.activityCritical]}>
                        <View style={styles.activityIcon}>
                            <AlertTriangle size={20} color="#FF3366" />
                        </View>
                        <View style={styles.activityInfo}>
                            <Text style={styles.activityTitle}>Immediate Danger Reported</Text>
                            <Text style={styles.activityTime}>2 mins ago • Central Station</Text>
                        </View>
                    </View>

                    <View style={styles.activityCard}>
                        <View style={styles.activityIcon}>
                            <ShieldAlert size={20} color="#A855F7" />
                        </View>
                        <View style={styles.activityInfo}>
                            <Text style={styles.activityTitle}>Suspicious Activity Logs</Text>
                            <Text style={styles.activityTime}>15 mins ago • North Campus</Text>
                        </View>
                    </View>
                </View>

            </ScrollView>

            {/* Padding block for the floating nav bar */}
            <View style={{ height: 100 }} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#09090B', // Deep dark zinc
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 16,
    },
    greeting: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    date: {
        fontSize: 14,
        color: '#A1A1AA',
        fontWeight: '500',
    },
    profileBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#27272A',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    profileInitial: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    heroCard: {
        backgroundColor: '#18181B',
        borderRadius: 24,
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 51, 102, 0.2)', // Subtle red glow border
    },
    heroContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    heroIconWrapper: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 51, 102, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    heroTextContent: {
        flex: 1,
    },
    heroTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    heroSubtitle: {
        fontSize: 13,
        color: '#A1A1AA',
        lineHeight: 18,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    viewAllText: {
        fontSize: 14,
        color: '#00f5ff',
        fontWeight: '500',
    },
    quickAccessRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    quickCard: {
        width: '48%',
        backgroundColor: '#18181B',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    iconWrapper: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    quickCardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    quickCardSub: {
        fontSize: 12,
        color: '#A1A1AA',
    },
    activityList: {
        gap: 12,
    },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#18181B',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.03)',
    },
    activityCritical: {
        borderColor: 'rgba(255, 51, 102, 0.3)',
        backgroundColor: 'rgba(255, 51, 102, 0.03)',
    },
    activityIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#27272A',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    activityInfo: {
        flex: 1,
    },
    activityTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#E4E4E7',
        marginBottom: 4,
    },
    activityTime: {
        fontSize: 12,
        color: '#A1A1AA',
    },
});
