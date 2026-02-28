import React, { useMemo } from 'react';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area,
    BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import {
    TrendingUp, AlertTriangle, MapPin, Camera, ShieldAlert,
    Users, Crosshair, Swords, Eye,
} from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';
import { DottedSurface } from './ui/dotted-surface';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import type { ImmediateDanger, CCTVCamera } from '../lib/supabase';

// --- Data helpers ---

function buildHourlyData(dangers: ImmediateDanger[], suspicious: any[]) {
    const hours: Record<number, { danger: number; suspicious: number }> = {};
    for (let i = 0; i < 24; i++) hours[i] = { danger: 0, suspicious: 0 };
    dangers.forEach(d => { hours[new Date(d.detected_at).getHours()].danger++; });
    suspicious.forEach(s => { hours[new Date(s.detected_at).getHours()].suspicious++; });
    return Object.entries(hours).map(([h, d]) => ({
        hour: `${h.padStart(2, '0')}:00`, danger: d.danger, suspicious: d.suspicious,
    }));
}

function buildWeaponBreakdown(dangers: ImmediateDanger[]) {
    const counts: Record<string, number> = {};
    dangers.forEach(d => {
        const t = (d.activity_type || 'unknown').toLowerCase();
        counts[t] = (counts[t] || 0) + 1;
    });
    const colors: Record<string, string> = {
        weapon: '#ef4444', fight: '#f97316', robbery: '#eab308', unknown: '#6b7280',
    };
    return Object.entries(counts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1), value, fill: colors[name] || '#6b7280',
    }));
}

function buildCameraAlerts(dangers: ImmediateDanger[], cameras: CCTVCamera[]) {
    const camMap: Record<string, { name: string; count: number }> = {};
    cameras.forEach(c => { camMap[c.camera_name] = { name: c.camera_name, count: 0 }; });
    dangers.forEach(d => {
        const lid = d.location_id;
        if (lid && camMap[lid]) camMap[lid].count++;
    });
    return Object.values(camMap).sort((a, b) => b.count - a.count);
}

function countUniquePersons(dangers: ImmediateDanger[]) {
    const ids = new Set<number>();
    dangers.forEach(d => { if (d.person_id != null) ids.add(d.person_id); });
    return ids.size;
}

// ============================================================================

export default function AnalyticsPanel() {
    const { immediateDangers, suspiciousLogs, cctvCameras } = useAlertStore();

    const hourlyData = useMemo(() => buildHourlyData(immediateDangers, suspiciousLogs), [immediateDangers, suspiciousLogs]);
    const weaponData = useMemo(() => buildWeaponBreakdown(immediateDangers), [immediateDangers]);
    const cameraAlerts = useMemo(() => buildCameraAlerts(immediateDangers, cctvCameras), [immediateDangers, cctvCameras]);
    const uniquePersons = useMemo(() => countUniquePersons(immediateDangers), [immediateDangers]);
    const activeDangers = immediateDangers.filter(d => d.is_active).length;
    const onlineCameras = cctvCameras.filter(c => c.is_active).length;

    const tooltipStyle = {
        background: 'rgba(10,10,10,0.92)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', color: '#fff', fontFamily: 'monospace', fontSize: 12,
    };

    return (
        <div className="relative w-full h-full overflow-y-auto overflow-x-hidden bg-[#050505] smooth-scroll-container">
            <DottedSurface className="opacity-100" />
            <div aria-hidden className={cn(
                'fixed top-1/2 left-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none',
                'bg-[radial-gradient(ellipse_at_center,rgba(0,170,255,0.08),transparent_60%)] blur-[70px] z-0',
            )} />

            <div className="relative w-full flex flex-col items-center pt-24 pb-32 z-20">
                {/* Hero */}
                <div className="w-full flex flex-col items-center px-8 mb-20">
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="text-center mb-16">
                        <ShieldAlert className="w-16 h-16 text-[#00aaff] mx-auto mb-6 opacity-80" />
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-4">NightWalk Analytics</h1>
                        <p className="text-gray-400 font-mono text-sm tracking-widest uppercase">Weapon Detection · Cross-Camera ReID · Threat Intelligence</p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }}
                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full max-w-6xl"
                    >
                        <StatCard icon={<AlertTriangle className="w-5 h-5" />} value={immediateDangers.length} label="Weapon Alerts" color="red" />
                        <StatCard icon={<Crosshair className="w-5 h-5" />} value={activeDangers} label="Active Threats" color="red" />
                        <StatCard icon={<Eye className="w-5 h-5" />} value={suspiciousLogs.length} label="Suspicious" color="yellow" />
                        <StatCard icon={<Users className="w-5 h-5" />} value={uniquePersons} label="Unique Suspects" color="purple" />
                        <StatCard icon={<Camera className="w-5 h-5" />} value={`${onlineCameras}/${cctvCameras.length}`} label="Cameras Online" color="cyan" />
                        <StatCard icon={<Swords className="w-5 h-5" />} value={weaponData.length} label="Threat Types" color="green" />
                    </motion.div>
                </div>

                {/* Charts Grid */}
                <div className="w-full max-w-7xl mx-auto px-8 space-y-8">
                    {/* Row 1: Timeline + Weapon Breakdown */}
                    <div className="grid lg:grid-cols-3 gap-8">
                        {/* Hourly timeline */}
                        <div className="lg:col-span-2 glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-2xl flex flex-col min-h-[380px]">
                            <SectionHeader icon={<TrendingUp className="w-5 h-5 text-[#00aaff]" />} iconBg="bg-[#00aaff]/10" title="Detection Timeline (24h)" />
                            <div className="flex-1 w-full min-h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="gDanger" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="gSuspicious" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="hour" stroke="#4b5563" fontSize={11} tickLine={false} tick={{ fill: '#9ca3af', fontFamily: 'monospace' }} />
                                        <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontFamily: 'monospace' }} allowDecimals={false} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Area type="monotone" dataKey="danger" stroke="#ef4444" fillOpacity={1} fill="url(#gDanger)" strokeWidth={2} name="Weapon Alerts" />
                                        <Area type="monotone" dataKey="suspicious" stroke="#eab308" fillOpacity={1} fill="url(#gSuspicious)" strokeWidth={2} name="Suspicious" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Weapon type donut */}
                        <div className="glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-2xl flex flex-col">
                            <SectionHeader icon={<Swords className="w-5 h-5 text-[#ef4444]" />} iconBg="bg-[#ef4444]/10" title="Threat Breakdown" />
                            {weaponData.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-sm">No detections yet</div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                    <div className="w-full h-[200px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={weaponData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                                                    paddingAngle={4} dataKey="value" stroke="none"
                                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                    labelLine={false}
                                                >
                                                    {weaponData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                                </Pie>
                                                <Tooltip contentStyle={tooltipStyle} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex flex-wrap gap-3 justify-center">
                                        {weaponData.map(w => (
                                            <div key={w.name} className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: w.fill }} />
                                                <span className="text-xs font-mono text-gray-400">{w.name}: {w.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Row 2: Per-camera alerts + ReID Summary */}
                    <div className="grid lg:grid-cols-3 gap-8">
                        {/* Per-camera bar chart */}
                        <div className="lg:col-span-2 glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-2xl flex flex-col min-h-[320px]">
                            <SectionHeader icon={<Camera className="w-5 h-5 text-[#00aaff]" />} iconBg="bg-[#00aaff]/10" title="Alerts per Camera" />
                            {cameraAlerts.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-sm">No cameras registered</div>
                            ) : (
                                <div className="flex-1 w-full min-h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={cameraAlerts} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                            <XAxis dataKey="name" stroke="#4b5563" fontSize={11} tickLine={false} tick={{ fill: '#9ca3af', fontFamily: 'monospace' }} />
                                            <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontFamily: 'monospace' }} allowDecimals={false} />
                                            <Tooltip contentStyle={tooltipStyle} />
                                            <Bar dataKey="count" name="Alerts" radius={[6, 6, 0, 0]}>
                                                {cameraAlerts.map((_, i) => (
                                                    <Cell key={i} fill={i === 0 ? '#ef4444' : '#00aaff'} fillOpacity={1 - i * 0.12} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {/* ReID / Tracking summary */}
                        <div className="glass-strong p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl shadow-2xl flex flex-col">
                            <SectionHeader icon={<Users className="w-5 h-5 text-[#a855f7]" />} iconBg="bg-[#a855f7]/10" title="Person Re-ID" />
                            <div className="flex-1 flex flex-col gap-4 mt-2">
                                <ReidStat label="Unique Suspects Tracked" value={uniquePersons} accent="#a855f7" />
                                <ReidStat label="Cross-Camera Sightings" value={immediateDangers.filter(d => d.person_id != null).length} accent="#f97316" />
                                <ReidStat label="Cameras with Detections" value={cameraAlerts.filter(c => c.count > 0).length} accent="#00aaff" />
                                <ReidStat label="Active Threats Now" value={activeDangers} accent="#ef4444" />

                                {/* Top tracked persons */}
                                <div className="mt-auto pt-4 border-t border-white/5">
                                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3">Top Tracked Persons</p>
                                    <TopPersonsList dangers={immediateDangers} />
                                </div>
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

function SectionHeader({ icon, iconBg, title }: { icon: React.ReactNode; iconBg: string; title: string }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
            <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
        </div>
    );
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: 'red' | 'yellow' | 'cyan' | 'purple' | 'green' }) {
    const colorMap = {
        red: 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20',
        yellow: 'text-[#eab308] bg-[#eab308]/10 border-[#eab308]/20',
        cyan: 'text-[#00aaff] bg-[#00aaff]/10 border-[#00aaff]/20',
        purple: 'text-[#a855f7] bg-[#a855f7]/10 border-[#a855f7]/20',
        green: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
    };
    return (
        <div className="glass-strong p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl transition-all hover:bg-white/[0.04] shadow-xl group">
            <div className={`mb-3 w-9 h-9 flex items-center justify-center rounded-xl border ${colorMap[color]} transition-transform group-hover:scale-110`}>{icon}</div>
            <div className="text-3xl md:text-4xl font-bold tracking-tighter text-white mb-1">{value}</div>
            <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{label}</div>
        </div>
    );
}

function ReidStat({ label, value, accent }: { label: string; value: number; accent: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{label}</span>
            <span className="text-xl font-bold font-mono" style={{ color: accent }}>{value}</span>
        </div>
    );
}

function TopPersonsList({ dangers }: { dangers: ImmediateDanger[] }) {
    const personCounts = useMemo(() => {
        const map: Record<number, { gid: number; count: number; cameras: Set<string> }> = {};
        dangers.forEach(d => {
            if (d.person_id == null) return;
            if (!map[d.person_id]) map[d.person_id] = { gid: d.person_id, count: 0, cameras: new Set() };
            map[d.person_id].count++;
            if (d.location_id) map[d.person_id].cameras.add(d.location_id);
        });
        return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 4);
    }, [dangers]);

    if (personCounts.length === 0) return <p className="text-xs text-gray-600 font-mono">No persons identified yet</p>;

    return (
        <div className="space-y-2">
            {personCounts.map(p => (
                <div key={p.gid} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <span className="text-xs font-mono font-bold text-orange-400">G{p.gid}</span>
                    <span className="flex-1 text-[11px] text-gray-400">{p.cameras.size} camera{p.cameras.size > 1 ? 's' : ''}</span>
                    <span className="text-xs font-mono text-gray-300">{p.count} alert{p.count > 1 ? 's' : ''}</span>
                </div>
            ))}
        </div>
    );
}
