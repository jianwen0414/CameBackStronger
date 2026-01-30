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
    longitude: 101.653568,
    latitude: 3.120503,
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
        >
            <div className="beacon-glow" />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-core" />
            <div className="beacon-beam" />
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
        >
            <div className="beacon-glow" />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-core" />
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
                            {/* Danger Beacons */}
                            {immediateDangers
                                .filter(d => d.lat && d.long)
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
                                .filter(s => s.lat && s.long)
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
