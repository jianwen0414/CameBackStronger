/**
 * NightWalk Web - Analytics Panel
 * Displays incident statistics, charts, and top unsafe zones
 */
import { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { TrendingUp, AlertTriangle, MapPin, Clock } from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';

// Generate hourly incident data from alerts
function generateHourlyData(dangers: any[], suspicious: any[]) {
    const hours: Record<number, { danger: number; suspicious: number }> = {};

    // Initialize all 24 hours
    for (let i = 0; i < 24; i++) {
        hours[i] = { danger: 0, suspicious: 0 };
    }

    // Count dangers by hour
    dangers.forEach(d => {
        const hour = new Date(d.detected_at).getHours();
        hours[hour].danger++;
    });

    // Count suspicious by hour
    suspicious.forEach(s => {
        const hour = new Date(s.detected_at).getHours();
        hours[hour].suspicious++;
    });

    // Convert to array for Recharts
    return Object.entries(hours).map(([hour, data]) => ({
        hour: `${hour.padStart(2, '0')}:00`,
        danger: data.danger,
        suspicious: data.suspicious,
        total: data.danger + data.suspicious
    }));
}

// Calculate top unsafe zones (mock zones based on coordinates clustering)
function getTopUnsafeZones(dangers: any[], suspicious: any[]) {
    // Simple zone clustering by rounding coordinates
    const zones: Record<string, { name: string; count: number; dangerCount: number }> = {};

    const allAlerts = [...dangers, ...suspicious];

    allAlerts.forEach(alert => {
        if (alert.lat && alert.long) {
            // Round to 2 decimal places to create "zones"
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
            if (isDanger) {
                zones[zoneKey].dangerCount++;
            }
        }
    });

    return Object.values(zones)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

export default function AnalyticsPanel() {
    const { immediateDangers, suspiciousLogs } = useAlertStore();

    const hourlyData = useMemo(
        () => generateHourlyData(immediateDangers, suspiciousLogs),
        [immediateDangers, suspiciousLogs]
    );

    const topZones = useMemo(
        () => getTopUnsafeZones(immediateDangers, suspiciousLogs),
        [immediateDangers, suspiciousLogs]
    );

    const totalIncidents = immediateDangers.length + suspiciousLogs.length;
    const criticalPercentage = totalIncidents > 0
        ? Math.round((immediateDangers.length / totalIncidents) * 100)
        : 0;

    return (
        <div className="h-full flex flex-col gap-4 p-4 overflow-auto">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4">
                <StatCard
                    icon={<AlertTriangle className="w-5 h-5" />}
                    value={immediateDangers.length}
                    label="Critical Alerts"
                    color="red"
                />
                <StatCard
                    icon={<Clock className="w-5 h-5" />}
                    value={suspiciousLogs.length}
                    label="Pending Review"
                    color="yellow"
                />
                <StatCard
                    icon={<TrendingUp className="w-5 h-5" />}
                    value={totalIncidents}
                    label="Total Incidents"
                    color="cyan"
                />
                <StatCard
                    icon={<MapPin className="w-5 h-5" />}
                    value={`${criticalPercentage}%`}
                    label="Critical Rate"
                    color="purple"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Incidents Over Time Chart */}
                <div className="glass-strong p-4 flex flex-col">
                    <div className="hud-header mb-4">Incidents Per Hour (24h)</div>
                    <div className="flex-1 min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={hourlyData}>
                                <defs>
                                    <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ff0040" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#ff0040" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="suspiciousGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ffcc00" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ffcc00" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="hour"
                                    stroke="#A0A0B0"
                                    fontSize={10}
                                    tickLine={false}
                                    tick={{ fill: '#A0A0B0', fontFamily: 'monospace' }}
                                />
                                <YAxis
                                    stroke="#A0A0B0"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#A0A0B0', fontFamily: 'monospace' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(20, 20, 25, 0.95)',
                                        border: '1px solid rgba(0, 240, 255, 0.3)',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        fontFamily: 'monospace'
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="danger"
                                    stroke="#ff0040"
                                    fillOpacity={1}
                                    fill="url(#dangerGradient)"
                                    strokeWidth={2}
                                    name="Critical"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="suspicious"
                                    stroke="#ffcc00"
                                    fillOpacity={1}
                                    fill="url(#suspiciousGradient)"
                                    strokeWidth={2}
                                    name="Suspicious"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Unsafe Zones */}
                <div className="glass-strong p-4 flex flex-col">
                    <div className="hud-header mb-4">Top 5 Unsafe Zones</div>
                    <div className="flex-1 flex flex-col gap-3">
                        {topZones.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
                                No zone data available
                            </div>
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

            {/* Trend Line */}
            <div className="glass-strong p-4">
                <div className="hud-header mb-4">24-Hour Trend</div>
                <div className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={hourlyData}>
                            <Line
                                type="monotone"
                                dataKey="total"
                                stroke="#00f5ff"
                                strokeWidth={2}
                                dot={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(20, 20, 30, 0.95)',
                                    border: '1px solid rgba(0, 245, 255, 0.3)',
                                    borderRadius: '8px',
                                    color: '#fff'
                                }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

// Stat Card Component
interface StatCardProps {
    icon: React.ReactNode;
    value: number | string;
    label: string;
    color: 'red' | 'yellow' | 'cyan' | 'purple' | 'green';
}

function StatCard({ icon, value, label, color }: StatCardProps) {
    const colorMap = {
        red: 'text-[#ff0040] drop-shadow-[0_0_5px_rgba(255,0,64,0.5)]',
        yellow: 'text-[#ffcc00] drop-shadow-[0_0_5px_rgba(255,204,0,0.5)]',
        cyan: 'text-[#00F0FF] drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]',
        purple: 'text-[#7000FF] drop-shadow-[0_0_5px_rgba(112,0,255,0.5)]',
        green: 'text-[#00ff88] drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]'
    };

    return (
        <div className="stat-box">
            <div className={`${colorMap[color]} mb-2`}>{icon}</div>
            <div className={`stat-value ${colorMap[color]}`}>{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

// Zone Row Component
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
        <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs font-bold">
                {rank}
            </div>
            <div className="flex-1">
                <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-[var(--text-secondary)]">
                        {incidents} incidents ({criticalCount} critical)
                    </span>
                </div>
                <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                            width: `${percentage}%`,
                            background: criticalCount > 0
                                ? 'linear-gradient(90deg, #ff0040, #ff6600)'
                                : 'linear-gradient(90deg, #ffcc00, #ff6600)'
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
