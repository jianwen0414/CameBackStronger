import React, { useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { TrendingUp, AlertTriangle, MapPin, Clock, ShieldAlert } from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';
import { DottedSurface } from './ui/dotted-surface';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

// --- Data Generation Helpers ---
function generateHourlyData(dangers: any[], suspicious: any[]) {
    const hours: Record<number, { danger: number; suspicious: number }> = {};
    for (let i = 0; i < 24; i++) {
        hours[i] = { danger: 0, suspicious: 0 };
    }
    dangers.forEach(d => {
        const hour = new Date(d.detected_at).getHours();
        hours[hour].danger++;
    });
    suspicious.forEach(s => {
        const hour = new Date(s.detected_at).getHours();
        hours[hour].suspicious++;
    });
    return Object.entries(hours).map(([hour, data]) => ({
        hour: `${hour.padStart(2, '0')}:00`,
        danger: data.danger,
        suspicious: data.suspicious,
        total: data.danger + data.suspicious
    }));
}

function getTopUnsafeZones(dangers: any[], suspicious: any[]) {
    const zones: Record<string, { name: string; count: number; dangerCount: number }> = {};
    const allAlerts = [...dangers, ...suspicious];
    allAlerts.forEach(alert => {
        if (alert.lat && alert.long) {
            const zoneKey = `${alert.lat.toFixed(2)},${alert.long.toFixed(2)}`;
            const isDanger = 'activity_type' in alert;
            if (!zones[zoneKey]) {
                zones[zoneKey] = {
                    name: `Zone ${Object.keys(zones).length + 1}`,
                    count: 0,
                    dangerCount: 0
                };
            }
            zones[zoneKey].count++;
            if (isDanger) zones[zoneKey].dangerCount++;
        }
    });
    return Object.values(zones).sort((a, b) => b.count - a.count).slice(0, 5);
}



// ============================================================================
// Main Component
// ============================================================================

export default function AnalyticsPanel() {
    const { immediateDangers, suspiciousLogs } = useAlertStore();

    // Data Processing
    const hourlyData = useMemo(() => generateHourlyData(immediateDangers, suspiciousLogs), [immediateDangers, suspiciousLogs]);
    const topZones = useMemo(() => getTopUnsafeZones(immediateDangers, suspiciousLogs), [immediateDangers, suspiciousLogs]);
    const totalIncidents = immediateDangers.length + suspiciousLogs.length;
    const criticalPercentage = totalIncidents > 0 ? Math.round((immediateDangers.length / totalIncidents) * 100) : 0;

    return (
        <div className="relative w-full h-full overflow-y-auto overflow-x-hidden bg-[#050505] smooth-scroll-container">
            {/* Strictly fixed Background Layer isolated from scrolling */}
            <DottedSurface className="opacity-100" />

            <div
                aria-hidden="true"
                className={cn(
                    'fixed top-1/2 left-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none',
                    'bg-[radial-gradient(ellipse_at_center,rgba(0,170,255,0.08),transparent_60%)]',
                    'blur-[70px] z-0'
                )}
            />

            {/* Scrollable Content Container */}
            <div className="relative w-full flex flex-col items-center pt-24 pb-32 z-20">

                {/* 1. Hero Section - Key Indicators */}
                <div className="w-full flex flex-col items-center px-8 mb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className="text-center mb-16"
                    >
                        <ShieldAlert className="w-16 h-16 text-[#00aaff] mx-auto mb-6 opacity-80" />
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-4">
                            City Overview
                        </h1>
                        <p className="text-gray-400 font-mono text-sm tracking-widest uppercase">
                            Real-time Intelligence & Threat Analysis
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                        className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-5xl"
                    >
                        <StatCard icon={<AlertTriangle className="w-5 h-5" />} value={immediateDangers.length} label="Critical Alerts" color="red" />
                        <StatCard icon={<Clock className="w-5 h-5" />} value={suspiciousLogs.length} label="Pending Review" color="yellow" />
                        <StatCard icon={<TrendingUp className="w-5 h-5" />} value={totalIncidents} label="Total Incidents" color="cyan" />
                        <StatCard icon={<MapPin className="w-5 h-5" />} value={`${criticalPercentage}%`} label="Critical Rate" color="purple" />
                    </motion.div>
                </div>

                {/* 2. Deep Analytics Section (Charts & Hotspots) */}
                <div className="w-full max-w-7xl mx-auto px-8 grid lg:grid-cols-3 gap-8 relative">

                    {/* Charts Column */}
                    <div className="lg:col-span-2 space-y-8 flex flex-col">
                        <div className="glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-2xl flex flex-col min-h-[400px]">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-2 rounded-lg bg-[#00aaff]/10">
                                    <TrendingUp className="w-5 h-5 text-[#00aaff]" />
                                </div>
                                <h3 className="text-lg font-semibold text-white tracking-tight">Incidents Per Hour (24h)</h3>
                            </div>
                            <div className="flex-1 w-full min-h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="suspiciousGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="hour" stroke="#4b5563" fontSize={11} tickLine={false} tick={{ fill: '#9ca3af', fontFamily: 'monospace' }} />
                                        <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontFamily: 'monospace' }} />
                                        <Tooltip contentStyle={{ background: 'rgba(10, 10, 10, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontFamily: 'monospace' }} />
                                        <Area type="monotone" dataKey="danger" stroke="#ef4444" fillOpacity={1} fill="url(#dangerGradient)" strokeWidth={2} name="Critical" />
                                        <Area type="monotone" dataKey="suspicious" stroke="#eab308" fillOpacity={1} fill="url(#suspiciousGradient)" strokeWidth={2} name="Suspicious" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-2xl">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6">Aggregate Trend Line</h3>
                            <div className="h-[140px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={hourlyData}>
                                        <Line type="monotone" dataKey="total" stroke="#00aaff" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Top Zones Column */}
                    <div className="flex flex-col h-full">
                        <div className="glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-xl h-full flex flex-col">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-2 rounded-lg bg-[#ef4444]/10">
                                    <MapPin className="w-5 h-5 text-[#ef4444]" />
                                </div>
                                <h3 className="text-lg font-semibold text-white tracking-tight">Identified Hotspots</h3>
                            </div>

                            <div className="flex-1 flex flex-col gap-6 w-full">
                                {topZones.length === 0 ? (
                                    <div className="m-auto text-gray-500 font-mono text-sm">Awaiting spatial clustering data...</div>
                                ) : (
                                    topZones.map((zone, index) => (
                                        <ZoneRow
                                            key={zone.name}
                                            rank={index + 1}
                                            name={zone.name}
                                            incidents={zone.count}
                                            criticalCount={zone.dangerCount}
                                            maxIncidents={topZones[0]?.count || 1}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}

// ============================================================================
// Subcomponents
// ============================================================================

interface StatCardProps {
    icon: React.ReactNode;
    value: number | string;
    label: string;
    color: 'red' | 'yellow' | 'cyan' | 'purple' | 'green';
}

function StatCard({ icon, value, label, color }: StatCardProps) {
    const colorMap = {
        red: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20',
        yellow: 'text-[#eab308] bg-[#eab308]/10 border-[#eab308]/20',
        cyan: 'text-[#00aaff] bg-[#00aaff]/10 border-[#00aaff]/20',
        purple: 'text-[#a855f7] bg-[#a855f7]/10 border-[#a855f7]/20',
        green: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
    };

    return (
        <div className="glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl transition-all hover:bg-white/[0.04] shadow-xl group">
            <div className={`mb-4 w-10 h-10 flex items-center justify-center rounded-xl border ${colorMap[color]} transition-transform group-hover:scale-110`}>
                {icon}
            </div>
            <div className="text-4xl md:text-5xl font-bold tracking-tighter text-white mb-2">{value}</div>
            <div className="text-sm text-gray-400 font-medium uppercase tracking-wider">{label}</div>
        </div>
    );
}

interface ZoneRowProps {
    rank: number;
    name: string;
    incidents: number;
    criticalCount: number;
    maxIncidents: number;
}

function ZoneRow({ rank, name, incidents, criticalCount, maxIncidents }: ZoneRowProps) {
    const percentage = (incidents / maxIncidents) * 100;

    return (
        <div className="flex flex-col gap-2 w-full group">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-mono font-bold text-gray-300">
                    {rank}
                </div>
                <div className="flex-1 pb-1 border-b border-white/5 group-hover:border-white/20 transition-colors">
                    <div className="flex justify-between items-baseline">
                        <span className="text-base font-semibold text-gray-200">{name}</span>
                        <span className="text-xs font-mono text-gray-500">
                            {incidents} (<span className="text-[#ef4444]">{criticalCount}</span>)
                        </span>
                    </div>
                </div>
            </div>
            <div className="w-full pl-12">
                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden shadow-inner">
                    <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                            width: `${percentage}%`,
                            background: criticalCount > 0
                                ? 'linear-gradient(90deg, #ef4444, #f97316)'
                                : 'linear-gradient(90deg, #eab308, #f59e0b)'
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
