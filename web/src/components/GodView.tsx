/**
 * NightWalk Web - God View Component
 * 4-Layer 3D city visualization using deck.gl with Google Photorealistic 3D Tiles
 * 
 * Layer 1: City Overview  - Wide zoom with green/red representative beacons per residential area
 * Layer 2: Residential    - Street-level zoom with individual beacons + modal incident view
 * 
 * Beacon Types:
 *   Red    - Immediate danger (weapon, fight, bomb)
 *   Yellow - Suspicious behavior
 *   Blue   - CCTV camera (normal activity, click for live stream)
 *   Purple - User-reported crime (with classification + AI analysis)
 */
import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import type { MapViewState } from '@deck.gl/core';
import { useAlertStore } from '../store/useAlertStore';
import type { ImmediateDanger, SuspiciousLog, CCTVCamera, UserReportedCrime, BeaconType } from '../lib/supabase';
import BeaconFilterPanel from './BeaconFilterPanel';

// View states for each layer
const CITY_VIEW_STATE: MapViewState = {
    longitude: 101.11118512535789,
    latitude: 4.647997024420677,
    zoom: 13,
    pitch: 35,
    bearing: 0
};

const RESIDENTIAL_VIEW_STATE: MapViewState = {
    longitude: 101.11118512535789,
    latitude: 4.647997024420677,
    zoom: 17,
    pitch: 45,
    bearing: 0
};

// Google Maps API key
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const GOOGLE_3D_TILES_URL = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`;

type ViewLayer = 1 | 2;

// Residential areas for City Overview representative beacons
interface ResidentialArea {
    id: string;
    name: string;
    longitude: number;
    latitude: number;
}

const RESIDENTIAL_AREAS: ResidentialArea[] = [
    { id: 'taman-maju', name: 'Taman Maju', longitude: 101.105, latitude: 4.652 },
    { id: 'kampung-baru', name: 'Kampung Baru', longitude: 101.115, latitude: 4.650 },
    { id: 'bukit-tinggi', name: 'Bukit Tinggi', longitude: 101.109, latitude: 4.644 },
    { id: 'sri-perdana', name: 'Sri Perdana', longitude: 101.118, latitude: 4.646 },
    { id: 'desa-harmoni', name: 'Desa Harmoni', longitude: 101.103, latitude: 4.641 },
    { id: 'laman-sentral', name: 'Laman Sentral', longitude: 101.120, latitude: 4.653 },
];

const AREA_RADIUS = 0.006; // roughly 600m radius to group beacons into areas

interface GodViewProps {
    onAlertClick?: (alert: ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime, type: BeaconType) => void;
}

// ============================================================================
// Beacon Components
// ============================================================================

function DangerBeacon({ onClick, activityType }: {
    alert: ImmediateDanger;
    onClick: () => void;
    activityType: string;
}) {
    return (
        <div className="map-beacon map-beacon--danger" onClick={onClick}
            title={`${activityType.toUpperCase()} - Click for details`}>
            <div className="beacon-glow" />
            <div className="beacon-glow" style={{ animationDelay: '1s' }} />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-beam" />
            <div className="beacon-core" />
            <div className="beacon-core-inner" />
            <div className="beacon-sparkle" style={{ top: '20%', left: '20%', animationDelay: '0s' }} />
            <div className="beacon-sparkle" style={{ top: '30%', right: '25%', animationDelay: '0.5s' }} />
            <div className="beacon-sparkle" style={{ bottom: '25%', left: '30%', animationDelay: '1s' }} />
            <div className="beacon-sparkle" style={{ bottom: '20%', right: '20%', animationDelay: '1.5s' }} />
            <div className="map-beacon-label">⚠ {activityType.toUpperCase()}</div>
        </div>
    );
}

function SuspiciousBeacon({ onClick }: {
    alert: SuspiciousLog;
    onClick: () => void;
}) {
    return (
        <div className="map-beacon map-beacon--suspicious" onClick={onClick}
            title="Suspicious Activity - Click for details">
            <div className="beacon-glow" />
            <div className="beacon-glow" style={{ animationDelay: '1.25s' }} />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-core" />
            <div className="beacon-core-inner" />
            <div className="beacon-sparkle" style={{ top: '25%', left: '25%', animationDelay: '0s' }} />
            <div className="beacon-sparkle" style={{ top: '30%', right: '30%', animationDelay: '0.7s' }} />
            <div className="beacon-sparkle" style={{ bottom: '30%', left: '25%', animationDelay: '1.4s' }} />
            <div className="map-beacon-label">👁 SUSPICIOUS</div>
        </div>
    );
}

function CCTVBeacon({ camera, onClick }: {
    camera: CCTVCamera;
    onClick: () => void;
}) {
    return (
        <div className="map-beacon map-beacon--cctv" onClick={onClick}
            title={`${camera.camera_name} - Click for live feed`}>
            <div className="beacon-glow" />
            <div className="beacon-glow" style={{ animationDelay: '1.5s' }} />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-core" />
            <div className="beacon-core-inner" />
            <div className="beacon-sparkle" style={{ top: '25%', left: '25%', animationDelay: '0s' }} />
            <div className="beacon-sparkle" style={{ bottom: '30%', right: '25%', animationDelay: '0.8s' }} />
            <div className="map-beacon-label">📹 {camera.camera_name}</div>
        </div>
    );
}

function ReportBeacon({ report, onClick }: {
    report: UserReportedCrime;
    onClick: () => void;
}) {
    return (
        <div className="map-beacon map-beacon--report" onClick={onClick}
            title={`User Report: ${report.crime_type.toUpperCase()} - Click for details`}>
            <div className="beacon-glow" />
            <div className="beacon-glow" style={{ animationDelay: '1.25s' }} />
            <div className="beacon-ring" />
            <div className="beacon-ring" />
            <div className="beacon-beam" />
            <div className="beacon-core" />
            <div className="beacon-core-inner" />
            <div className="beacon-sparkle" style={{ top: '20%', left: '20%', animationDelay: '0s' }} />
            <div className="beacon-sparkle" style={{ top: '30%', right: '25%', animationDelay: '0.6s' }} />
            <div className="beacon-sparkle" style={{ bottom: '25%', left: '30%', animationDelay: '1.2s' }} />
            <div className="map-beacon-label">🟣 {report.crime_type.toUpperCase()}</div>
        </div>
    );
}

// ============================================================================
// Layer Navigation Breadcrumb
// ============================================================================

function LayerBreadcrumb({ currentLayer, onLayerChange }: {
    currentLayer: ViewLayer;
    onLayerChange: (layer: ViewLayer) => void;
}) {
    const layers = [
        { id: 1 as ViewLayer, label: 'City Overview' },
        { id: 2 as ViewLayer, label: 'Residential' },
    ];

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 glass px-3 py-2">
            {layers.map((layer, index) => (
                <div key={layer.id} className="flex items-center">
                    {index > 0 && (
                        <span className="mx-1 text-gray-500 text-xs">›</span>
                    )}
                    <button
                        onClick={() => onLayerChange(layer.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${currentLayer === layer.id
                            ? 'bg-white text-black shadow-md'
                            : 'text-gray-200 hover:text-white hover:bg-white/10 cursor-pointer'
                            }`}
                    >
                        {layer.label}
                    </button>
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// Main GodView Component
// ============================================================================

export default function GodView({ onAlertClick }: GodViewProps) {
    const {
        immediateDangers, suspiciousLogs, cctvCameras, userReportedCrimes,
        fetchAlerts, fetchCCTVCameras, fetchUserReportedCrimes,
        subscribeToRealtime, beaconFilters, selectAlert, openModal,
    } = useAlertStore();

    const [viewState, setViewState] = useState<MapViewState>(RESIDENTIAL_VIEW_STATE);
    const [currentLayer, setCurrentLayer] = useState<ViewLayer>(2);
    const terrainAltRef = useRef(50); // Approximate terrain elevation for Ipoh, Malaysia area

    useEffect(() => {
        fetchAlerts();
        fetchCCTVCameras();
        fetchUserReportedCrimes();
        const unsubscribe = subscribeToRealtime();

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return unsubscribe;
    }, [fetchAlerts, fetchCCTVCameras, fetchUserReportedCrimes, subscribeToRealtime]);

    const handleLayerChange = useCallback((layer: ViewLayer, targetLong?: number, targetLat?: number) => {
        setCurrentLayer(layer);
        if (layer === 1) {
            setViewState(CITY_VIEW_STATE);
        } else if (layer === 2) {
            setViewState({
                ...RESIDENTIAL_VIEW_STATE,
                longitude: targetLong ?? RESIDENTIAL_VIEW_STATE.longitude,
                latitude: targetLat ?? RESIDENTIAL_VIEW_STATE.latitude,
            });
        }
    }, []);

    // Compute residential area threat status for city overview
    const areaStatuses = useMemo(() => {
        return RESIDENTIAL_AREAS.map(area => {
            const hasThreat =
                immediateDangers.some(d => d.lat && d.long &&
                    Math.abs(d.long! - area.longitude) < AREA_RADIUS &&
                    Math.abs(d.lat! - area.latitude) < AREA_RADIUS) ||
                suspiciousLogs.some(s => s.lat && s.long &&
                    Math.abs(s.long! - area.longitude) < AREA_RADIUS &&
                    Math.abs(s.lat! - area.latitude) < AREA_RADIUS) ||
                userReportedCrimes.some(r => r.lat && r.long &&
                    Math.abs(r.long - area.longitude) < AREA_RADIUS &&
                    Math.abs(r.lat - area.latitude) < AREA_RADIUS);
            return { ...area, hasThreat };
        });
    }, [immediateDangers, suspiciousLogs, userReportedCrimes]);

    const handleAlertClick = useCallback((
        alert: ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime,
        type: BeaconType
    ) => {
        selectAlert(alert, type);
        openModal();
        if (onAlertClick) onAlertClick(alert, type);
    }, [onAlertClick, selectAlert, openModal]);

    const layers = useMemo(() => [
        new Tile3DLayer({
            id: 'google-3d-tiles',
            data: GOOGLE_3D_TILES_URL,
            loadOptions: {
                fetch: {
                    headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY }
                }
            },
            onTilesetLoad: (tileset: any) => {
                const { cartographicCenter } = tileset;
                if (cartographicCenter) {
                    const alt = cartographicCenter[2];
                    // Only use tileset altitude if it's a reasonable terrain value (0-500m)
                    // Google global 3D Tiles root returns Earth-center altitude (~-6M), which is unusable
                    if (alt > 0 && alt < 500) {
                        terrainAltRef.current = alt;
                    }
                    console.log('Tileset loaded at:', cartographicCenter, 'terrain alt used:', terrainAltRef.current);
                }
            }
        })
    ], []);

    return (
        <div className="relative w-full h-full">
            <DeckGL
                initialViewState={RESIDENTIAL_VIEW_STATE}
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs as MapViewState)}
                controller={true}
                layers={layers}
                style={{ background: 'var(--bg-primary)' }}
            >
                {({ viewport }) => {
                    if (!viewport) return null;

                    return (
                        <>


                            {/* ===== City Overview: Residential Area Representative Beacons ===== */}
                            {currentLayer === 1 && areaStatuses.map(area => {
                                const [x, y] = viewport.project([area.longitude, area.latitude, terrainAltRef.current]);
                                const color = area.hasThreat ? '#ff0040' : '#00ff88';
                                return (
                                    <div
                                        key={area.id}
                                        style={{ position: 'absolute', left: x, top: y, pointerEvents: 'auto' }}
                                        onClick={() => handleLayerChange(2, area.longitude, area.latitude)}
                                        className="cursor-pointer group"
                                        title={`${area.name} — ${area.hasThreat ? 'THREATS DETECTED' : 'All Clear'}`}
                                    >
                                        {/* Outer pulse rings */}
                                        <div className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full animate-ping opacity-20"
                                            style={{ background: color }} />
                                        <div className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full animate-pulse opacity-30"
                                            style={{ background: color, animationDelay: '0.5s' }} />
                                        {/* Core dot */}
                                        <div className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white/60"
                                            style={{ background: color, boxShadow: `0 0 18px ${color}, 0 0 40px ${color}55` }} />
                                        {/* Label */}
                                        <div className="absolute left-1/2 -translate-x-1/2 top-5 whitespace-nowrap text-[10px] font-mono tracking-wide px-2 py-0.5 rounded bg-black/60 border border-white/10"
                                            style={{ color }}>
                                            {area.hasThreat ? '⚠' : '✓'} {area.name}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* ===== Residential View: Individual Beacons ===== */}
                            {/* Red Beacons - Immediate Danger */}
                            {currentLayer === 2 && beaconFilters.red && immediateDangers
                                .filter(d => d.lat && d.long)
                                .map(danger => {
                                    const [x, y] = viewport.project([danger.long!, danger.lat!, terrainAltRef.current]);
                                    return (
                                        <div key={danger.id} style={{ position: 'absolute', left: x, top: y, pointerEvents: 'auto' }}>
                                            <DangerBeacon
                                                alert={danger}
                                                activityType={danger.activity_type}
                                                onClick={() => handleAlertClick(danger, 'red')}
                                            />
                                        </div>
                                    );
                                })}

                            {/* Yellow Beacons - Suspicious Activity */}
                            {currentLayer === 2 && beaconFilters.yellow && suspiciousLogs
                                .filter(s => s.lat && s.long)
                                .map(suspicious => {
                                    const [x, y] = viewport.project([suspicious.long!, suspicious.lat!, terrainAltRef.current]);
                                    return (
                                        <div key={suspicious.id} style={{ position: 'absolute', left: x, top: y, pointerEvents: 'auto' }}>
                                            <SuspiciousBeacon
                                                alert={suspicious}
                                                onClick={() => handleAlertClick(suspicious, 'yellow')}
                                            />
                                        </div>
                                    );
                                })}

                            {/* Blue Beacons - CCTV Cameras */}
                            {currentLayer === 2 && beaconFilters.blue && cctvCameras
                                .filter(c => c.lat && c.long)
                                .map(camera => {
                                    const [x, y] = viewport.project([camera.long, camera.lat, terrainAltRef.current]);
                                    return (
                                        <div key={camera.id} style={{ position: 'absolute', left: x, top: y, pointerEvents: 'auto' }}>
                                            <CCTVBeacon
                                                camera={camera}
                                                onClick={() => handleAlertClick(camera, 'blue')}
                                            />
                                        </div>
                                    );
                                })}

                            {/* Purple Beacons - User Reported Crimes */}
                            {currentLayer === 2 && beaconFilters.purple && userReportedCrimes
                                .filter(r => r.lat && r.long)
                                .map(report => {
                                    const [x, y] = viewport.project([report.long, report.lat, terrainAltRef.current]);
                                    return (
                                        <div key={report.id} style={{ position: 'absolute', left: x, top: y, pointerEvents: 'auto' }}>
                                            <ReportBeacon
                                                report={report}
                                                onClick={() => handleAlertClick(report, 'purple')}
                                            />
                                        </div>
                                    );
                                })}
                        </>
                    );
                }}
            </DeckGL>

            {/* Layer Navigation Breadcrumb */}
            <LayerBreadcrumb currentLayer={currentLayer} onLayerChange={handleLayerChange} />

            {/* Beacon Filter Panel (visible on Layer 2) */}
            <BeaconFilterPanel />

            {/* HUD Overlay */}
            <div className="absolute top-14 left-4 glass p-4 z-10">
                <div className="hud-header mb-2">Operations Center</div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="beacon-red" />
                        <span className="text-sm">{immediateDangers.length} Active Threats</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="status-dot status-warning" />
                        <span className="text-sm">{suspiciousLogs.length} Pending Review</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="beacon-blue-dot" />
                        <span className="text-sm">{cctvCameras.length} CCTV Cameras</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="beacon-purple-dot" />
                        <span className="text-sm">{userReportedCrimes.length} User Reports</span>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 glass p-3 z-10">
                <div className="hud-header mb-2">Legend</div>
                <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white/20" />
                        <span className="text-gray-300">Immediate Danger</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-white/20" />
                        <span className="text-gray-300">Suspicious Activity</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-white/20" />
                        <span className="text-gray-300">CCTV Camera</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-white/20" />
                        <span className="text-gray-300">User Reported Crime</span>
                    </div>
                </div>
            </div>

            {/* Live Threat Alert */}
            {immediateDangers.length > 0 && (
                <div className="absolute top-14 right-4 z-10">
                    <div className="flex items-center gap-2 glass-strong p-3 border-l-4 border-red-500">
                        <div className="beacon-red" />
                        <span className="text-red-500 font-bold text-sm tracking-wider">
                            Live Threat Detected
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
