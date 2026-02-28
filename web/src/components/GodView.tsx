/**
 * NightWalk Web - God View Component
 * 4-Layer 3D city visualization using deck.gl with Google Photorealistic 3D Tiles
 * 
 * Layer 1: City Overview  - Wide zoom with green/red representative beacons per residential area
 * Layer 2: Residential    - Street-level zoom with individual beacons + modal incident view
 * 
 * All beacons render as WebGL deck.gl layers (ScatterplotLayer + TextLayer)
 * so they stay perfectly in sync with the 3D tiles during pan/rotate/zoom.
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
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
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
// Beacon colours (RGBA 0-255)
// ============================================================================
const COLORS = {
    red: [255, 0, 64] as [number, number, number],       // #ff0040
    yellow: [255, 200, 0] as [number, number, number],    // #ffc800
    blue: [56, 189, 248] as [number, number, number],     // sky-400
    purple: [168, 85, 247] as [number, number, number],   // purple-500
    green: [0, 255, 136] as [number, number, number],     // #00ff88
    threatRed: [255, 0, 64] as [number, number, number],  // #ff0040
};

// Unified beacon data point for ScatterplotLayer
interface BeaconDatum {
    id: string;
    lng: number;
    lat: number;
    alt: number;
    color: [number, number, number];
    type: BeaconType | 'area';
    label: string;
    source: ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime | ResidentialArea & { hasThreat: boolean };
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

    // Animate pulse rings
    const [pulsePhase, setPulsePhase] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setPulsePhase(p => (p + 1) % 60), 50); // ~20fps animation
        return () => clearInterval(id);
    }, []);

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

    // ========================================================================
    // Build beacon data for deck.gl layers
    // ========================================================================
    const defaultAlt = terrainAltRef.current;

    // alertData: red/yellow/purple — stay at exact coordinates, get pulse rings
    // cctvData:  blue — offset ~12m NE so they never stack over alerts
    const CCTV_LNG_OFFSET = 0.00010; // ~11m east
    const CCTV_LAT_OFFSET = 0.00005; // ~5.5m north

    const { alertData, cctvData } = useMemo(() => {
        const alerts: BeaconDatum[] = [];
        const cctv: BeaconDatum[] = [];

        if (currentLayer === 1) {
            for (const area of areaStatuses) {
                alerts.push({
                    id: area.id,
                    lng: area.longitude,
                    lat: area.latitude,
                    alt: defaultAlt,
                    color: area.hasThreat ? COLORS.threatRed : COLORS.green,
                    type: 'area',
                    label: `${area.hasThreat ? '⚠' : '✓'} ${area.name}`,
                    source: area,
                });
            }
        }

        if (currentLayer === 2) {
            if (beaconFilters.yellow) {
                for (const s of suspiciousLogs) {
                    if (!s.lat || !s.long) continue;
                    alerts.push({
                        id: s.id,
                        lng: s.long!,
                        lat: s.lat!,
                        alt: s.altitude ?? defaultAlt,
                        color: COLORS.yellow,
                        type: 'yellow',
                        label: '👁 SUSPICIOUS',
                        source: s,
                    });
                }
            }

            if (beaconFilters.purple) {
                for (const r of userReportedCrimes) {
                    if (!r.lat || !r.long) continue;
                    alerts.push({
                        id: r.id,
                        lng: r.long,
                        lat: r.lat,
                        alt: r.altitude ?? defaultAlt,
                        color: COLORS.purple,
                        type: 'purple',
                        label: `🟣 ${r.crime_type.toUpperCase()}`,
                        source: r,
                    });
                }
            }

            if (beaconFilters.red) {
                for (const d of immediateDangers) {
                    if (!d.lat || !d.long) continue;
                    alerts.push({
                        id: d.id,
                        lng: d.long!,
                        lat: d.lat!,
                        alt: d.altitude ?? defaultAlt,
                        color: COLORS.red,
                        type: 'red',
                        label: `⚠ ${d.activity_type.toUpperCase()}`,
                        source: d,
                    });
                }
            }

            // CCTV beacons offset so they never stack over alerts
            if (beaconFilters.blue) {
                for (const c of cctvCameras) {
                    if (!c.lat || !c.long) continue;
                    cctv.push({
                        id: c.id,
                        lng: c.long + CCTV_LNG_OFFSET,
                        lat: c.lat + CCTV_LAT_OFFSET,
                        alt: c.altitude ?? defaultAlt,
                        color: COLORS.blue,
                        type: 'blue',
                        label: `📹 ${c.camera_name}`,
                        source: c,
                    });
                }
            }
        }

        return { alertData: alerts, cctvData: cctv };
    }, [currentLayer, areaStatuses, immediateDangers, suspiciousLogs, cctvCameras, userReportedCrimes, beaconFilters, defaultAlt]);

    // ========================================================================
    // Handle click on a beacon
    // ========================================================================
    const onBeaconClick = useCallback((info: PickingInfo) => {
        const d = info.object as BeaconDatum | undefined;
        if (!d) return;

        if (d.type === 'area') {
            const area = d.source as ResidentialArea & { hasThreat: boolean };
            handleLayerChange(2, area.longitude, area.latitude);
        } else {
            handleAlertClick(
                d.source as ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime,
                d.type as BeaconType
            );
        }
    }, [handleLayerChange, handleAlertClick]);

    // ========================================================================
    // Build deck.gl layers
    // ========================================================================
    const pulseScale = 1 + 0.4 * Math.sin((pulsePhase / 60) * Math.PI * 2); // 1.0 – 1.4
    const pulseOpacity = 60 + 40 * Math.sin((pulsePhase / 60) * Math.PI * 2); // 60 – 100

    const layers = useMemo(() => [
        // Google 3D Tiles
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
                    if (alt > 0 && alt < 500) {
                        terrainAltRef.current = alt;
                    }
                }
            }
        }),

        // ── CCTV beacons (blue, no pulse, small, offset from alerts) ─────────
        // Static dot only — no pulse rings so alerts are visually dominant
        new ScatterplotLayer<BeaconDatum>({
            id: 'cctv-core',
            data: cctvData,
            pickable: true,
            stroked: true,
            filled: true,
            getPosition: (d: BeaconDatum) => [d.lng, d.lat, d.alt],
            getRadius: 4,
            getFillColor: (d: BeaconDatum) => [...d.color, 200] as [number, number, number, number],
            getLineColor: [255, 255, 255, 120],
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels' as const,
            radiusUnits: 'meters' as const,
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            onClick: onBeaconClick,
        }),
        new TextLayer<BeaconDatum>({
            id: 'cctv-labels',
            data: cctvData,
            pickable: true,
            getPosition: (d: BeaconDatum) => [d.lng, d.lat, d.alt],
            getText: (d: BeaconDatum) => d.label,
            getSize: 10,
            getColor: (d: BeaconDatum) => [...d.color, 200] as [number, number, number, number],
            getAngle: 0,
            getPixelOffset: [12, -14],
            fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
            fontWeight: 600,
            outlineWidth: 3,
            outlineColor: [0, 0, 0, 200],
            background: true,
            getBackgroundColor: [10, 10, 15, 160],
            backgroundPadding: [4, 2],
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            onClick: onBeaconClick,
        }),

        // ── Alert beacons (red/yellow/purple/area) — full pulse animation ─────
        // Outer pulse ring
        new ScatterplotLayer<BeaconDatum>({
            id: 'alert-pulse-outer',
            data: alertData,
            pickable: false,
            stroked: true,
            filled: false,
            getPosition: (d: BeaconDatum) => [d.lng, d.lat, d.alt],
            getRadius: currentLayer === 1 ? 60 * pulseScale : 18 * pulseScale,
            getLineColor: (d: BeaconDatum) => [...d.color, pulseOpacity] as [number, number, number, number],
            getLineWidth: 2,
            lineWidthUnits: 'pixels' as const,
            radiusUnits: 'meters' as const,
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            updateTriggers: {
                getRadius: [pulseScale, currentLayer],
                getLineColor: [pulseOpacity],
            },
        }),
        // Middle ring
        new ScatterplotLayer<BeaconDatum>({
            id: 'alert-pulse-inner',
            data: alertData,
            pickable: false,
            stroked: true,
            filled: false,
            getPosition: (d: BeaconDatum) => [d.lng, d.lat, d.alt],
            getRadius: currentLayer === 1 ? 40 * pulseScale : 12 * pulseScale,
            getLineColor: (d: BeaconDatum) => [...d.color, pulseOpacity + 30] as [number, number, number, number],
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels' as const,
            radiusUnits: 'meters' as const,
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            updateTriggers: {
                getRadius: [pulseScale, currentLayer],
                getLineColor: [pulseOpacity],
            },
        }),
        // Solid core dot
        new ScatterplotLayer<BeaconDatum>({
            id: 'alert-core',
            data: alertData,
            pickable: true,
            stroked: true,
            filled: true,
            getPosition: (d: BeaconDatum) => [d.lng, d.lat, d.alt],
            getRadius: currentLayer === 1 ? 20 : 6,
            getFillColor: (d: BeaconDatum) => [...d.color, 220] as [number, number, number, number],
            getLineColor: [255, 255, 255, 150],
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels' as const,
            radiusUnits: 'meters' as const,
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            onClick: onBeaconClick,
            updateTriggers: {
                getRadius: [currentLayer],
            },
        }),
        // Alert labels (above the dot)
        new TextLayer<BeaconDatum>({
            id: 'alert-labels',
            data: alertData,
            pickable: true,
            getPosition: (d: BeaconDatum) => [d.lng, d.lat, d.alt],
            getText: (d: BeaconDatum) => d.label,
            getSize: currentLayer === 1 ? 13 : 11,
            getColor: (d: BeaconDatum) => [...d.color, 255] as [number, number, number, number],
            getAngle: 0,
            getPixelOffset: [0, currentLayer === 1 ? -30 : -20],
            fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
            fontWeight: 700,
            outlineWidth: 3,
            outlineColor: [0, 0, 0, 200],
            background: true,
            getBackgroundColor: [10, 10, 15, 180],
            backgroundPadding: [6, 3],
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            onClick: onBeaconClick,
            updateTriggers: {
                getSize: [currentLayer],
                getPixelOffset: [currentLayer],
            },
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [alertData, cctvData, pulseScale, pulseOpacity, currentLayer, onBeaconClick]);

    return (
        <div className="relative w-full h-full">
            <DeckGL
                initialViewState={RESIDENTIAL_VIEW_STATE}
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs as MapViewState)}
                controller={true}
                layers={layers}
                style={{ background: 'var(--bg-primary)' }}
                getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
            />

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
