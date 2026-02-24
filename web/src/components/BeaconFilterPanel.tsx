/**
 * NightWalk Web - Beacon Filter Panel
 * Allows toggling visibility of the 4 beacon types on the God View map
 */
import { motion } from 'framer-motion';
import { Eye, EyeOff, Camera, AlertTriangle, Shield, Users } from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';
import type { BeaconType } from '../lib/supabase';

const BEACON_CONFIG: {
    type: BeaconType;
    label: string;
    color: string;
    glowColor: string;
    icon: React.ReactNode;
}[] = [
        {
            type: 'red',
            label: 'Dangers',
            color: '#ff0040',
            glowColor: 'rgba(255,0,64,0.4)',
            icon: <AlertTriangle className="w-3.5 h-3.5" />,
        },
        {
            type: 'yellow',
            label: 'Suspicious',
            color: '#ffcc00',
            glowColor: 'rgba(255,204,0,0.4)',
            icon: <Shield className="w-3.5 h-3.5" />,
        },
        {
            type: 'blue',
            label: 'CCTV',
            color: '#00aaff',
            glowColor: 'rgba(0,170,255,0.4)',
            icon: <Camera className="w-3.5 h-3.5" />,
        },
        {
            type: 'purple',
            label: 'Reports',
            color: '#a855f7',
            glowColor: 'rgba(168,85,247,0.4)',
            icon: <Users className="w-3.5 h-3.5" />,
        },
    ];

export default function BeaconFilterPanel() {
    const { beaconFilters, toggleBeaconFilter } = useAlertStore();

    return (
        <div className="absolute bottom-4 left-4 z-20">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass p-2 flex flex-col gap-1"
            >
                <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest px-2 mb-1">
                    Filters
                </div>
                {BEACON_CONFIG.map(({ type, label, color, glowColor, icon }) => {
                    const enabled = beaconFilters[type];
                    return (
                        <button
                            key={type}
                            onClick={() => toggleBeaconFilter(type)}
                            className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all
                                ${enabled
                                    ? 'bg-white/5 border border-white/10'
                                    : 'opacity-70 border border-transparent hover:opacity-100'
                                }
                            `}
                            style={enabled ? { borderColor: `${color}40`, boxShadow: `0 0 8px ${glowColor}` } : {}}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{
                                    backgroundColor: enabled ? color : '#555',
                                    boxShadow: enabled ? `0 0 6px ${color}` : 'none',
                                }}
                            />
                            <span style={{ color: enabled ? color : '#888' }}>{icon}</span>
                            <span className={enabled ? 'text-white font-medium' : 'text-gray-300 font-medium'}>{label}</span>
                            {enabled
                                ? <Eye className="w-3 h-3 text-gray-300 ml-auto" />
                                : <EyeOff className="w-3 h-3 text-gray-400 ml-auto" />
                            }
                        </button>
                    );
                })}
            </motion.div>
        </div>
    );
}
