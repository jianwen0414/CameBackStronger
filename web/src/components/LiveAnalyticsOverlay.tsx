/**
 * LiveAnalyticsOverlay
 * Real-time analytics HUD displayed over a CCTV stream view.
 * Receives data from the MQTT broker via useMqttStore.
 */
import { useEffect } from 'react';
import { Users, ShieldAlert, Activity, Wifi, WifiOff, Crosshair, Sword } from 'lucide-react';
import { useMqttStore, type CameraAnalytics } from '../store/useMqttStore';

interface LiveAnalyticsOverlayProps {
    cameraName: string;
}

export default function LiveAnalyticsOverlay({ cameraName }: LiveAnalyticsOverlayProps) {
    const connect = useMqttStore(s => s.connect);
    const connected = useMqttStore(s => s.connected);
    // Subscribe to analytics directly so component re-renders on every new MQTT message
    const analytics = useMqttStore(s => s.analytics);

    // Resolve analytics for this camera from the latest snapshot
    const entries = Object.values(analytics);
    const name = cameraName.toLowerCase();
    const data: CameraAnalytics | null = entries.length === 0 ? null :
        entries.find(
            a => name.includes(a.topic_prefix.toLowerCase()) ||
                 a.topic_prefix.toLowerCase().includes(name.replace(/\s+/g, '-'))
        ) ??
        entries.reduce((latest, cur) => cur.last_updated > latest.last_updated ? cur : latest);

    // Ensure MQTT is connected when overlay mounts
    useEffect(() => {
        connect();
    }, [connect]);

    const isStale = data ? Date.now() - data.last_updated > 10_000 : true;

    const statusBadge = () => {
        if (!connected) return { icon: <WifiOff className="w-3 h-3" />, label: 'No Signal', cls: 'bg-gray-800/60 border-white/10 text-gray-500' };
        if (isStale)    return { icon: <Wifi className="w-3 h-3" />,    label: 'Waiting for Edge…', cls: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600' };
        return           { icon: <Wifi className="w-3 h-3" />,           label: 'Live Analytics', cls: 'bg-green-500/15 border-green-500/30 text-green-400' };
    };
    const badge = statusBadge();

    return (
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
            {/* Connection badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider border
                ${connected && !isStale
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : 'bg-gray-800/60 border-white/10 text-gray-500'}`}
            >
                {connected && !isStale
                    ? <><Wifi className="w-3 h-3" /> Live Analytics</>
                    : <><WifiOff className="w-3 h-3" /> No Signal</>
                }
            </div>

            {data && !isStale && (
                <div className="flex gap-2">
                    {/* Person count */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/70 border border-[#00aaff]/30 backdrop-blur-sm">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#00aaff]/15">
                            <Users className="w-4 h-4 text-[#00aaff]" />
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 font-mono uppercase leading-none">Persons</div>
                            <div className="text-lg font-bold text-white leading-tight">{data.person_count}</div>
                        </div>
                    </div>

                    {/* Gun count */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm border
                        ${(data.gun_count ?? 0) > 0
                            ? 'bg-red-500/20 border-red-500/40'
                            : 'bg-black/70 border-white/10'}`}
                    >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-lg
                            ${(data.gun_count ?? 0) > 0 ? 'bg-red-500/20' : 'bg-gray-500/10'}`}
                        >
                            <Crosshair className={`w-4 h-4 ${(data.gun_count ?? 0) > 0 ? 'text-red-400 animate-pulse' : 'text-gray-500'}`} />
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 font-mono uppercase leading-none">Guns</div>
                            <div className={`text-lg font-bold leading-tight ${(data.gun_count ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                                {data.gun_count ?? 0}
                            </div>
                        </div>
                    </div>

                    {/* Knife count */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm border
                        ${(data.knife_count ?? 0) > 0
                            ? 'bg-orange-500/20 border-orange-500/40'
                            : 'bg-black/70 border-white/10'}`}
                    >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-lg
                            ${(data.knife_count ?? 0) > 0 ? 'bg-orange-500/20' : 'bg-gray-500/10'}`}
                        >
                            <Sword className={`w-4 h-4 ${(data.knife_count ?? 0) > 0 ? 'text-orange-400 animate-pulse' : 'text-gray-500'}`} />
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 font-mono uppercase leading-none">Knives</div>
                            <div className={`text-lg font-bold leading-tight ${(data.knife_count ?? 0) > 0 ? 'text-orange-400' : 'text-white'}`}>
                                {data.knife_count ?? 0}
                            </div>
                        </div>
                    </div>

                    {/* Alert count */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm border
                        ${data.active_threats > 0
                            ? 'bg-red-500/20 border-red-500/40'
                            : 'bg-black/70 border-white/10'}`}
                    >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-lg
                            ${data.active_threats > 0 ? 'bg-red-500/20' : 'bg-yellow-500/10'}`}
                        >
                            <ShieldAlert className={`w-4 h-4 ${data.active_threats > 0 ? 'text-red-400 animate-pulse' : 'text-yellow-500'}`} />
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 font-mono uppercase leading-none">Alerts</div>
                            <div className={`text-lg font-bold leading-tight ${data.active_threats > 0 ? 'text-red-400' : 'text-white'}`}>
                                {data.alert_count}
                            </div>
                        </div>
                    </div>

                    {/* Active threats */}
                    {data.active_threats > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/50 backdrop-blur-sm">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/20">
                                <Activity className="w-4 h-4 text-red-400 animate-pulse" />
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-400 font-mono uppercase leading-none">Active</div>
                                <div className="text-lg font-bold text-red-400 leading-tight">{data.active_threats}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
