/**
 * NightWalk Web - God View Component
 * 3D city visualization using deck.gl with Google Photorealistic 3D Tiles
 */
import { useEffect, useMemo, useCallback, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { useAlertStore } from '../store/useAlertStore';
import type { ImmediateDanger, SuspiciousLog } from '../lib/supabase';

// Initial view state - User specified location
const INITIAL_VIEW_STATE: MapViewState = {
    longitude: 101.11118512535789,
    latitude: 4.647997024420677,
    zoom: 17,
    pitch: 45,
    bearing: 0
};

// Google Maps API key (must be set in environment)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// 3D Tiles URL with API key
const GOOGLE_3D_TILES_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`;

interface GodViewProps {
    onAlertClick?: (alert: ImmediateDanger | SuspiciousLog) => void;
}

// Beacon component for danger alerts
function DangerBeacon({
    alert,
    onClick,
    activityType
}: {
    alert: ImmediateDanger;
    onClick: () => void;
    activityType: string;
}) {
    return (
        <div
            className="map-beacon map-beacon--danger"
            onClick={onClick}
            title={`${activityType.toUpperCase()} - Click for details`}
        >
            {/* Outer glow layers */}
            <div className="beacon-glow" />
            <div className="beacon-glow" style={{ animationDelay: '1s' }} />
            
            {/* Pulsing rings */}
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            
            {/* Vertical light beam */}
            <div className="beacon-beam" />
            
            {/* Core with inner glow */}
            <div className="beacon-core" />
            <div className="beacon-core-inner" />
            
            {/* Sparkle particles */}
            <div className="beacon-sparkle" style={{ top: '20%', left: '20%', animationDelay: '0s' }} />
            <div className="beacon-sparkle" style={{ top: '30%', right: '25%', animationDelay: '0.5s' }} />
            <div className="beacon-sparkle" style={{ bottom: '25%', left: '30%', animationDelay: '1s' }} />
            <div className="beacon-sparkle" style={{ bottom: '20%', right: '20%', animationDelay: '1.5s' }} />
            
            {/* Label */}
            <div className="map-beacon-label">
                ⚠ {activityType.toUpperCase()}
            </div>
        </div>
    );
}

// Beacon component for suspicious activity
function SuspiciousBeacon({
    alert,
    onClick
}: {
    alert: SuspiciousLog;
    onClick: () => void;
}) {
    return (
        <div
            className="map-beacon map-beacon--suspicious"
            onClick={onClick}
            title="Suspicious Activity - Click for details"
        >
            {/* Outer glow layers */}
            <div className="beacon-glow" />
            <div className="beacon-glow" style={{ animationDelay: '1.25s' }} />
            
            {/* Pulsing rings */}
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            
            {/* Core with inner glow */}
            <div className="beacon-core" />
            <div className="beacon-core-inner" />
            
            {/* Sparkle particles */}
            <div className="beacon-sparkle" style={{ top: '25%', left: '25%', animationDelay: '0s' }} />
            <div className="beacon-sparkle" style={{ top: '30%', right: '30%', animationDelay: '0.7s' }} />
            <div className="beacon-sparkle" style={{ bottom: '30%', left: '25%', animationDelay: '1.4s' }} />
            
            {/* Label */}
            <div className="map-beacon-label">
                👁 SUSPICIOUS
            </div>
        </div>
    );
}

export default function GodView({ onAlertClick }: GodViewProps) {
    const { immediateDangers, suspiciousLogs, fetchAlerts, subscribeToRealtime } = useAlertStore();
    const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);

    useEffect(() => {
        fetchAlerts();
        const unsubscribe = subscribeToRealtime();

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return unsubscribe;
    }, [fetchAlerts, subscribeToRealtime]);

    // Project lat/lng to screen coordinates
    const projectToScreen = useCallback((lng: number, lat: number, deck: any) => {
        if (!deck) return null;
        const viewport = deck.getViewports()[0];
        if (!viewport) return null;

        const [x, y] = viewport.project([lng, lat]);
        return { x, y };
    }, []);

    const handleAlertClick = useCallback((alert: ImmediateDanger | SuspiciousLog) => {
        if (onAlertClick) {
            onAlertClick(alert);
        }
    }, [onAlertClick]);

    const layers = useMemo(() => [
        // Google Photorealistic 3D Tiles Layer
        new Tile3DLayer({
            id: 'google-3d-tiles',
            data: GOOGLE_3D_TILES_URL,
            loadOptions: {
                fetch: {
                    headers: {
                        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY
                    }
                }
            },
            onTilesetLoad: (tileset: any) => {
                const { cartographicCenter } = tileset;
                if (cartographicCenter) {
                    console.log('Tileset loaded at:', cartographicCenter);
                }
            }
        })
    ], []);

    return (
        <div className="relative w-full h-full">
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs as MapViewState)}
                controller={true}
                layers={layers}
                style={{ background: 'var(--bg-primary)' }}
            >
                {({ viewState: currentViewState, viewport }) => {
                    if (!viewport) return null;

                    return (
                        <>
                            {/* Monitor Bezel Overlay */}
                            <div className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden">
                                {/* Corners */}
                                <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-cyan-500/50 rounded-tl-lg" />
                                <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-cyan-500/50 rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-cyan-500/50 rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-cyan-500/50 rounded-br-lg" />
                                
                                {/* Technical Markings */}
                                <div className="absolute top-4 left-20 text-[10px] font-mono text-cyan-500/50 tracking-widest">SYS.VISUAL.01</div>
                                <div className="absolute bottom-4 right-20 text-[10px] font-mono text-cyan-500/50 tracking-widest">LIVE FEED // SECURE</div>

                                {/* Crosshairs */}
                                <div className="absolute top-1/2 left-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 border border-white/20 rounded-full" />
                                <div className="absolute top-1/2 left-1/2 w-[1px] h-8 -translate-x-1/2 -translate-y-1/2 bg-white/20" />
                                <div className="absolute top-1/2 left-1/2 w-8 h-[1px] -translate-x-1/2 -translate-y-1/2 bg-white/20" />
                                
                                {/* Scanlines */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-20" />
                            </div>

                            {/* Danger Beacons */}
                            {immediateDangers
                                .filter(d => {
                                    const hasCoords = d.lat && d.long;
                                    if (!hasCoords) {
                                        console.warn('Danger missing coordinates:', d.id, 'lat:', d.lat, 'long:', d.long, 'coordinates:', d.coordinates);
                                    }
                                    return hasCoords;
                                })
                                .map(danger => {
                                    const [x, y] = viewport.project([danger.long!, danger.lat!]);
                                    return (
                                        <div
                                            key={danger.id}
                                            style={{
                                                position: 'absolute',
                                                left: x,
                                                top: y,
                                                pointerEvents: 'auto'
                                            }}
                                        >
                                            <DangerBeacon
                                                alert={danger}
                                                activityType={danger.activity_type}
                                                onClick={() => handleAlertClick(danger)}
                                            />
                                        </div>
                                    );
                                })}

                            {/* Suspicious Beacons */}
                            {suspiciousLogs
                                .filter(s => {
                                    const hasCoords = s.lat && s.long;
                                    if (!hasCoords) {
                                        console.warn('Suspicious missing coordinates:', s.id, 'lat:', s.lat, 'long:', s.long, 'coordinates:', s.coordinates);
                                    }
                                    return hasCoords;
                                })
                                .map(suspicious => {
                                    const [x, y] = viewport.project([suspicious.long!, suspicious.lat!]);
                                    return (
                                        <div
                                            key={suspicious.id}
                                            style={{
                                                position: 'absolute',
                                                left: x,
                                                top: y,
                                                pointerEvents: 'auto'
                                            }}
                                        >
                                            <SuspiciousBeacon
                                                alert={suspicious}
                                                onClick={() => handleAlertClick(suspicious)}
                                            />
                                        </div>
                                    );
                                })}
                        </>
                    );
                }}
            </DeckGL>

            {/* HUD Overlay */}
            <div className="absolute top-4 left-4 glass p-4">
                <div className="hud-header mb-2">Operations Center</div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="beacon-red" />
                        <span className="text-sm">{immediateDangers.length} Active Threats</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="status-dot status-warning" />
                        <span className="text-sm">{suspiciousLogs.length} Pending Review</span>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 glass p-3">
                <div className="hud-header mb-2">Legend</div>
                <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#ff0040]" style={{ boxShadow: '0 0 8px #ff0040' }} />
                        <span>Immediate Danger</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 8px #ffcc00' }} />
                        <span>Suspicious Activity</span>
                    </div>
                </div>
            </div>

            {/* Beacon pulse overlay for visual effect */}
            {immediateDangers.length > 0 && (
                <div className="absolute top-4 right-4">
                    <div className="flex items-center gap-2 glass-strong p-3 border-l-4 border-[#ff0040]">
                        <div className="beacon-red" />
                        <span className="text-glow-red font-bold text-sm uppercase tracking-wider">
                            Live Threat Detected
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
