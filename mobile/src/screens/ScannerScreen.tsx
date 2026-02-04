/**
 * NightWalk Mobile - Scanner Screen (AR Tab)
 * AR view with SVG overlays for hazard visualization
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    PermissionsAndroid,
    Platform,
    Alert,
} from 'react-native';
import Svg, {
    Circle,
    LinearGradient,
    RadialGradient,
    Path,
    Rect,
    Defs,
    Stop,
    G,
    Pattern,
} from 'react-native-svg';
import Geolocation from '@react-native-community/geolocation';
import GeospatialModule, { AnchorResult } from '../native/GeospatialModule';
import { useAlertStore } from '../store/useAlertStore';

const SCREEN_WIDTH = 400;
const SCREEN_HEIGHT = 800;

export default function ScannerScreen() {
    const [isARReady, setIsARReady] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<{
        lat: number;
        long: number;
    } | null>(null);
    const [hazardAnchors, setHazardAnchors] = useState<AnchorResult[]>([]);
    const [arError, setArError] = useState<string | null>(null);

    const { nearbyHazards, zoneSafety, fetchNearbyHazards } = useAlertStore();

    // Request permissions
    useEffect(() => {
        async function requestPermissions() {
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);

                const allGranted = Object.values(granted).every(
                    status => status === PermissionsAndroid.RESULTS.GRANTED,
                );

                if (!allGranted) {
                    Alert.alert(
                        'Permissions Required',
                        'Camera and Location permissions are required for AR features.',
                    );
                }
            }
        }
        requestPermissions();
    }, []);

    // Initialize ARCore Geospatial
    useEffect(() => {
        async function initAR() {
            try {
                const result = await GeospatialModule.initialize();
                if (result.success) {
                    setIsARReady(true);
                    setArError(null);
                }
            } catch (error: any) {
                // Expected on emulators - ARCore Geospatial API requires physical device
                const errorCode = error.code || '';
                const isEmulatorLimitation = 
                    errorCode === 'ARCORE_NOT_AVAILABLE' || 
                    errorCode === 'DEVICE_NOT_COMPATIBLE';
                
                if (isEmulatorLimitation) {
                    setArError('AR mode requires physical device. Using GPS-only mode.');
                } else {
                    setArError(error.message || 'Failed to initialize AR');
                }
                
                console.log('ARCore not available, using GPS fallback');
            }
        }
        initAR();

        return () => {
            GeospatialModule.destroy().catch(() => { });
        };
    }, []);

    // Get current location
    useEffect(() => {
        const watchId = Geolocation.watchPosition(
            position => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ lat: latitude, long: longitude });
                fetchNearbyHazards(latitude, longitude, 500);
            },
            error => console.error('Location error:', error),
            { enableHighAccuracy: true, distanceFilter: 10 },
        );

        return () => Geolocation.clearWatch(watchId);
    }, [fetchNearbyHazards]);

    // Calculate hazard anchors using Geospatial API
    const updateHazardAnchors = useCallback(async () => {
        if (!isARReady || nearbyHazards.length === 0) return;

        const anchors: AnchorResult[] = [];

        for (const hazard of nearbyHazards.slice(0, 10)) {
            try {
                const anchor = await GeospatialModule.getGeospatialAnchor(
                    hazard.coordinates.lat,
                    hazard.coordinates.long,
                );
                anchors.push(anchor);
            } catch {
                // Skip if anchor calculation fails
            }
        }

        setHazardAnchors(anchors);
    }, [isARReady, nearbyHazards]);

    useEffect(() => {
        const interval = setInterval(updateHazardAnchors, 1000);
        return () => clearInterval(interval);
    }, [updateHazardAnchors]);

    // Get closest hazard distance for red mist effect
    const closestHazard = hazardAnchors.reduce<AnchorResult | null>(
        (closest, anchor) => {
            if (!closest || anchor.distanceMeters < closest.distanceMeters) {
                return anchor;
            }
            return closest;
        },
        null,
    );

    const showRedMist = closestHazard && closestHazard.distanceMeters < 20;
    const redMistIntensity = closestHazard
        ? Math.max(0, 1 - closestHazard.distanceMeters / 20)
        : 0;

    return (
        <View style={styles.container}>
            {/* AR Camera View Placeholder */}
            <View style={styles.cameraView}>
                <Text style={styles.cameraPlaceholder}>
                    {isARReady ? '🎥 AR Camera Active' : arError || 'Initializing AR...'}
                </Text>
                {arError && !isARReady && (
                    <Text style={styles.cameraNote}>
                        ℹ️ Hazard tracking active using GPS. For AR mode, use a physical device.
                    </Text>
                )}
            </View>

            {/* SVG Overlay */}
            <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.overlay}>
                <Defs>
                    <LinearGradient id="redMist" x1="0" y1="0" x2="0" y2="1">
                        <Stop
                            offset="0%"
                            stopColor="rgb(255, 0, 64)"
                            stopOpacity={redMistIntensity * 0.4}
                        />
                        <Stop
                            offset="50%"
                            stopColor="rgb(255, 0, 64)"
                            stopOpacity={redMistIntensity * 0.1}
                        />
                        <Stop
                            offset="100%"
                            stopColor="rgb(255, 0, 64)"
                            stopOpacity={redMistIntensity * 0.4}
                        />
                    </LinearGradient>
                    <RadialGradient id="redMistGlow" cx="50%" cy="50%" r="70%">
                        <Stop offset="0%" stopColor="rgb(255, 0, 64)" stopOpacity={redMistIntensity * 0.35} />
                        <Stop offset="60%" stopColor="rgb(255, 0, 64)" stopOpacity={redMistIntensity * 0.15} />
                        <Stop offset="100%" stopColor="rgb(20, 0, 10)" stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="hazardGlowRed" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor="rgb(255, 40, 90)" stopOpacity={0.8} />
                        <Stop offset="60%" stopColor="rgb(255, 0, 64)" stopOpacity={0.4} />
                        <Stop offset="100%" stopColor="rgb(10, 0, 6)" stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="hazardGlowYellow" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor="rgb(255, 230, 120)" stopOpacity={0.8} />
                        <Stop offset="60%" stopColor="rgb(255, 204, 0)" stopOpacity={0.4} />
                        <Stop offset="100%" stopColor="rgb(10, 8, 0)" stopOpacity={0} />
                    </RadialGradient>
                    <LinearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor="rgb(0, 0, 0)" stopOpacity={0.15} />
                        <Stop offset="50%" stopColor="rgb(0, 0, 0)" stopOpacity={0} />
                        <Stop offset="100%" stopColor="rgb(0, 0, 0)" stopOpacity={0.2} />
                    </LinearGradient>
                    <Pattern id="scanlines" width="6" height="6" patternUnits="userSpaceOnUse">
                        <Rect x="0" y="0" width="6" height="1" fill="rgba(0, 255, 255, 0.08)" />
                    </Pattern>
                </Defs>

                {/* Subtle vignette */}
                <Rect x={0} y={0} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#vignette)" />

                {/* Red Mist Effect when hazard < 20m */}
                {showRedMist && (
                    <>
                        <Rect
                            x={0}
                            y={0}
                            width={SCREEN_WIDTH}
                            height={SCREEN_HEIGHT}
                            fill="url(#redMist)"
                        />
                        <Rect
                            x={0}
                            y={0}
                            width={SCREEN_WIDTH}
                            height={SCREEN_HEIGHT}
                            fill="url(#redMistGlow)"
                        />
                    </>
                )}

                {/* Green Path Arrow (center) */}
                <G transform={`translate(${SCREEN_WIDTH / 2 - 25}, ${SCREEN_HEIGHT / 2 - 50})`}>
                    <Path
                        d="M25 0 L50 30 L35 30 L35 60 L15 60 L15 30 L0 30 Z"
                        fill="rgba(0, 255, 136, 0.8)"
                    />
                </G>

                {/* Hazard Indicators */}
                {hazardAnchors.map((anchor, index) => {
                    if (!anchor.isInFront) return null;

                    // Convert bearing to screen position
                    const x =
                        SCREEN_WIDTH / 2 + (anchor.relativeBearingDegrees / 90) * (SCREEN_WIDTH / 2);
                    const y = SCREEN_HEIGHT * 0.4 + anchor.elevationAngleDegrees * 2;

                    // Size based on distance
                    const size = Math.max(10, 50 - anchor.distanceMeters / 10);
                    const isCritical = anchor.distanceMeters < 50;
                    const baseColor = isCritical ? 'rgba(255, 0, 64, 0.8)' : 'rgba(255, 204, 0, 0.6)';
                    const glowId = isCritical ? 'hazardGlowRed' : 'hazardGlowYellow';

                    return (
                        <G key={index}>
                            <Circle cx={x} cy={y} r={size * 1.9} fill={`url(#${glowId})`} />
                            <Circle cx={x} cy={y} r={size * 1.2} fill={baseColor} opacity={0.35} />
                            <Circle cx={x} cy={y} r={size * 0.85} fill={baseColor} />
                            <Circle
                                cx={x}
                                cy={y}
                                r={size * 1.35}
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.18)"
                                strokeWidth={1}
                            />
                        </G>
                    );
                })}

                {/* Scanlines and subtle HUD noise */}
                <Rect
                    x={0}
                    y={0}
                    width={SCREEN_WIDTH}
                    height={SCREEN_HEIGHT}
                    fill="url(#scanlines)"
                    opacity={0.6}
                />
            </Svg>

            {/* HUD Overlay */}
            <View style={styles.hud}>
                <View style={styles.hudTopLeft}>
                    <Text style={styles.hudLabel}>ZONE SAFETY</Text>
                    <Text
                        style={[
                            styles.hudValue,
                            { color: zoneSafety > 70 ? '#00ff88' : zoneSafety > 40 ? '#ffcc00' : '#ff0040' },
                        ]}
                    >
                        {zoneSafety}%
                    </Text>
                </View>

                <View style={styles.hudTopRight}>
                    <Text style={styles.hudLabel}>HAZARDS NEARBY</Text>
                    <Text style={styles.hudValue}>{nearbyHazards.length}</Text>
                </View>

                {closestHazard && (
                    <View style={styles.hudBottom}>
                        <Text style={styles.warningText}>
                            ⚠️ Nearest threat: {Math.round(closestHazard.distanceMeters)}m
                        </Text>
                    </View>
                )}
            </View>

            {/* Scanlines Effect */}
            <View style={styles.scanlines} pointerEvents="none" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0f',
    },
    cameraView: {
        flex: 1,
        backgroundColor: '#1a1a25',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraPlaceholder: {
        color: '#606070',
        fontSize: 16,
        fontFamily: 'monospace',
    },
    cameraNote: {
        color: '#00f5ff',
        fontSize: 12,
        marginTop: 12,
        textAlign: 'center',
        paddingHorizontal: 40,
        lineHeight: 18,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
    },
    hud: {
        ...StyleSheet.absoluteFillObject,
        padding: 20,
    },
    hudTopLeft: {
        position: 'absolute',
        top: 20,
        left: 20,
        backgroundColor: 'rgba(10, 10, 20, 0.7)',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
    },
    hudTopRight: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(10, 10, 20, 0.7)',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
    },
    hudBottom: {
        position: 'absolute',
        bottom: 100,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(255, 0, 64, 0.2)',
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ff0040',
        alignItems: 'center',
    },
    hudLabel: {
        color: '#606070',
        fontSize: 10,
        fontFamily: 'monospace',
        letterSpacing: 2,
        marginBottom: 4,
    },
    hudValue: {
        color: '#00f5ff',
        fontSize: 28,
        fontWeight: '700',
        fontFamily: 'monospace',
    },
    warningText: {
        color: '#ff0040',
        fontSize: 14,
        fontWeight: '600',
        textShadowColor: 'rgba(255, 0, 64, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    scanlines: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
        opacity: 0.05,
    },
});
