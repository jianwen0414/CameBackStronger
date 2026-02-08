/**
 * NightWalk Mobile - Map Screen (Tab 2)
 * Dark mode map with heatmap layer and route toggles
 */
import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    TextInput,
    PermissionsAndroid,
    Platform,
    Animated,
} from 'react-native';
import { Svg, Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import MapView, { Heatmap, Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { MapPin, Navigation, Shield, Car, User, X, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, RotateCw, CornerUpLeft, CornerUpRight, Merge, Split } from 'lucide-react-native';
import Config from 'react-native-config';
import Geolocation from '@react-native-community/geolocation';
// @ts-ignore - Type definitions not available
import polyline from '@mapbox/polyline';
import { useAlertStore } from '../store/useAlertStore';

const { width, height } = Dimensions.get('window');

// Midnight Commander Map Style
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "poi.park", elementType: "labels.text.stroke", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] }
];

// Mock routes (in production, fetch from routing API)
const SAFE_ROUTE = [
    { latitude: 3.1390, longitude: 101.6869 },
    { latitude: 3.1400, longitude: 101.6880 },
    { latitude: 3.1410, longitude: 101.6900 },
    { latitude: 3.1420, longitude: 101.6920 },
];

const FAST_ROUTE = [
    { latitude: 3.1390, longitude: 101.6869 },
    { latitude: 3.1395, longitude: 101.6890 },
    { latitude: 3.1405, longitude: 101.6910 },
    { latitude: 3.1420, longitude: 101.6920 },
];

type RouteType = 'safe' | 'fast' | null;
type TransportationMode = 'driving' | 'walking';
type NavigationStep = {
    instruction: string;
    distance: { text: string; value: number };
    duration: { text: string; value: number };
    startLocation: { lat: number; lng: number };
    endLocation: { lat: number; lng: number };
    maneuver?: string;
    polyline: string;
};

// Default coordinates constant
const DEFAULT_COORDS = {
    latitude: 4.647997024420677,
    longitude: 101.11118512535789,
};

// Animated Beacon Component - supports red (immediate), yellow (suspicious), and purple (report) beacons
function AnimatedBeacon({ hazard }: { hazard: any }) {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.8)).current;
    
    // Determine beacon kind: 'immediate' (red), 'suspicious' (yellow), or 'report' (purple)
    const beaconKind: string = hazard.beacon_kind || (hazard.is_immediate ? 'immediate' : 'suspicious');
    
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.2,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        
        const opacity = Animated.loop(
            Animated.sequence([
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0.6,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        
        pulse.start();
        opacity.start();
        
        return () => {
            pulse.stop();
            opacity.stop();
        };
    }, []);

    const ringStyle = beaconKind === 'immediate' ? styles.beaconRingDanger
        : beaconKind === 'report' ? styles.beaconRingReport
        : styles.beaconRingSuspicious;
    const glowStyle = beaconKind === 'immediate' ? styles.beaconGlowDanger
        : beaconKind === 'report' ? styles.beaconGlowReport
        : styles.beaconGlowSuspicious;
    const coreStyle = beaconKind === 'immediate' ? styles.beaconCoreDanger
        : beaconKind === 'report' ? styles.beaconCoreReport
        : styles.beaconCoreSuspicious;
    const innerStyle = beaconKind === 'immediate' ? styles.beaconInnerDanger
        : beaconKind === 'report' ? styles.beaconInnerReport
        : styles.beaconInnerSuspicious;
    
    return (
        <Animated.View 
            style={[
                styles.beaconContainer,
                {
                    transform: [{ scale: pulseAnim }],
                    opacity: opacityAnim,
                }
            ]} 
            pointerEvents="none"
        >
            {/* Pulsing outer ring */}
            <Animated.View
                style={[
                    styles.beaconRing,
                    ringStyle,
                    {
                        opacity: opacityAnim,
                        transform: [{ scale: pulseAnim }],
                    }
                ]}
            />
            {/* Outer glow */}
            <Animated.View
                style={[
                    styles.beaconGlow,
                    glowStyle,
                    {
                        opacity: opacityAnim,
                    }
                ]}
            />
            {/* Core */}
            <View
                style={[
                    styles.beaconCore,
                    coreStyle,
                ]}
            />
            {/* Inner highlight */}
            <View
                style={[
                    styles.beaconInner,
                    innerStyle,
                ]}
            />
        </Animated.View>
    );
}

// User Puck with Torch/Gradient Effect
// Represents the user's location and heading
function UserPuck({ heading }: { heading: number }) {
    // Large container to ensure the torch cone (which extends outwards) is not clipped by the Marker bitmap creation
    const containerSize = 300; 
    const center = containerSize / 2;
    const coneHeight = 150;
    const coneWidth = 100;

    return (
        <View style={{
            width: containerSize,
            height: containerSize,
            justifyContent: 'center',
            alignItems: 'center',
        }}>
            <View style={{
                height: coneHeight, 
                width: coneWidth,
                position: 'absolute',
                top: center - coneHeight, // Bottom of cone touches center
                left: center - (coneWidth / 2), // Centered horizontally
                alignItems: 'center',
            }}>
                <Svg height="100%" width="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                     <Defs>
                        <RadialGradient id="grad" cx="50%" cy="100%" rx="50%" ry="90%" fx="50%" fy="100%" gradientUnits="userSpaceOnUse">
                            <Stop offset="0%" stopColor="#00f5ff" stopOpacity="0.4" />
                            <Stop offset="100%" stopColor="#00f5ff" stopOpacity="0" />
                        </RadialGradient>
                    </Defs>
                    <Path 
                        d="M0,0 L100,0 L50,100 Z" 
                        fill="url(#grad)" 
                    /> 
                </Svg>
            </View>

            {/* The Puck Itself - White circle with Blue border */}
            <View style={styles.puckCore}>
                 <View style={styles.puckInner} />
            </View>
        </View>
    );
}

// "Aero" Style Maneuver Arrow
// High-end, stealth-bomber shape with drop shadow for 3D feel on the map
function ManeuverArrow({ isNext }: { isNext: boolean }) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isNext) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scaleAnim, {
                        toValue: 1.2,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(scaleAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            scaleAnim.setValue(1); // Reset if not next
        }
    }, [isNext]);

    const size = isNext ? 50 : 35; // Larger size for better visibility

    return (
        <Animated.View style={{
            width: size,
            height: size,
            justifyContent: 'center',
            alignItems: 'center',
            transform: [{ scale: scaleAnim }]
        }}>
            {/* 3D Drop Shadow Layer (Offset + Dark) */}
            <View style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                top: 4,     // Shadow separation
                opacity: 0.3,
            }}>
                <Svg width="100%" height="100%" viewBox="0 0 100 100">
                    <Path 
                         d="M 50 0 L 100 100 L 50 80 L 0 100 Z" 
                         fill="#000000"
                    />
                </Svg>
            </View>

            {/* Main Arrow Body (White) */}
            <View style={{
                width: '100%',
                height: '100%',
            }}>
                 <Svg width="100%" height="100%" viewBox="0 0 100 100">
                    <Path 
                         d="M 50 0 L 100 100 L 50 80 L 0 100 Z" 
                         fill="#FFFFFF"
                         stroke="#cccccc"
                         strokeWidth="1"
                    />
                </Svg>
            </View>
        </Animated.View>
    );
}


export default function MapScreen() {
    const mapRef = useRef<MapView>(null);
    const locationWatchId = useRef<number | null>(null);
    const prevLocation = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
    const [currentLocation, setCurrentLocation] = useState(DEFAULT_COORDS);
    const [currentHeading, setCurrentHeading] = useState(0); // Bearing in degrees
    const [activeRoute, setActiveRoute] = useState<RouteType>(null);
    const [transportationMode, setTransportationMode] = useState<TransportationMode>('driving');
    const [isNavigating, setIsNavigating] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [navigationSteps, setNavigationSteps] = useState<NavigationStep[]>([]);
    const [remainingDistance, setRemainingDistance] = useState<{ text: string; value: number } | null>(null);
    const [remainingDuration, setRemainingDuration] = useState<{ text: string; value: number } | null>(null);
    const [originLabel, setOriginLabel] = useState('Default Location');
    const [originCoords, setOriginCoords] = useState<{
        latitude: number;
        longitude: number;
    } | null>(DEFAULT_COORDS);
    const [originPlaceId, setOriginPlaceId] = useState<string | null>(null);
    const [destinationLabel, setDestinationLabel] = useState('');
    const [destinationCoords, setDestinationCoords] = useState<{
        latitude: number;
        longitude: number;
    } | null>(null);
    const [destinationPlaceId, setDestinationPlaceId] = useState<string | null>(null);
    const [fastestRoute, setFastestRoute] = useState<
        { coordinates: { latitude: number; longitude: number }[]; duration: number } | null
    >(null);
    const [safestRoute, setSafestRoute] = useState<
        { coordinates: { latitude: number; longitude: number }[]; safetyScore: number } | null
    >(null);
    const [isRouting, setIsRouting] = useState(false);
    const [routeError, setRouteError] = useState<string | null>(null);

    const { nearbyHazards, fetchNearbyHazards, zoneSafety, nearbyCount, subscribeToAlerts, setUserLocation } = useAlertStore();
    const mapsApiKey = Config.GOOGLE_MAPS_API_KEY || '';

    const requestLocationPermission = async () => {
        if (Platform.OS !== 'android') return true;
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
    };

    const refreshCurrentLocation = async () => {
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
            // If permission denied, use default coordinates
            setCurrentLocation(DEFAULT_COORDS);
            fetchNearbyHazards(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude);
            setOriginLabel('Default Location');
            setOriginCoords(DEFAULT_COORDS);
            setOriginPlaceId(null);
            setRouteError('Location permission denied. Using default location.');
            return;
        }

        Geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ latitude, longitude });
                setUserLocation(latitude, longitude);
                fetchNearbyHazards(latitude, longitude);
                setOriginLabel('Current Location');
                setOriginCoords({ latitude, longitude });
                setOriginPlaceId(null);
                setRouteError(null);

                mapRef.current?.animateToRegion({
                    latitude,
                    longitude,
                    latitudeDelta: 0.002, // Zoom level: Street (Closer)
                    longitudeDelta: 0.002,
                });
            },
            error => {
                console.error('Location error:', error);
                // On GPS error, use default coordinates
                setCurrentLocation(DEFAULT_COORDS);
                fetchNearbyHazards(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude);
                setOriginLabel('Default Location');
                setOriginCoords(DEFAULT_COORDS);
                setOriginPlaceId(null);
                setRouteError('Unable to get GPS location. Using default location.');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    };

    // Note: GPS location is only fetched when user clicks "Use GPS" button for Origin
    // but automatic updates happen during Navigation via startNavigation
    useEffect(() => {
        // Initial map setup
        mapRef.current?.animateToRegion({
            latitude: DEFAULT_COORDS.latitude,
            longitude: DEFAULT_COORDS.longitude,
            latitudeDelta: 0.002, // Zoom level: Street (Closer)
            longitudeDelta: 0.002,
        });
        
        fetchNearbyHazards(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude);
        const unsubscribe = subscribeToAlerts();
        return () => unsubscribe();
    }, []);

    // Watch compass heading separately for smoother rotation when stationary or moving slowly
    // (If relying only on Geolocation.watchPosition, heading updates might be sparse)
    // Note: react-native-community/geolocation doesn't have a dedicated compass watcher.
    // For production, consider using 'react-native-sensors' or 'react-native-compass-heading'.
    // Here we rely on GPS heading which works well when driving (speed > 0).


    // Convert hazards to heatmap points
    const heatmapPoints = nearbyHazards
        .filter(h => h.coordinates?.lat && h.coordinates?.long)
        .map(h => ({
            latitude: h.coordinates.lat,
            longitude: h.coordinates.long,
            weight: h.is_immediate ? 1 : 0.5,
        }));

    const decodePolyline = (encoded: string) =>
        polyline.decode(encoded).map((point: [number, number]) => ({
            latitude: point[0],
            longitude: point[1],
        }));

    const calculateSafetyScore = (routeIndex: number) => {
        // TODO: Send these polyline coordinates to Python Backend to intersect with PostGIS hazard layers.
        return routeIndex === 1 ? 90 : 50;
    };

    const fitToRoute = (coords: { latitude: number; longitude: number }[]) => {
        if (coords.length === 0) return;
        mapRef.current?.fitToCoordinates(coords, {
            edgePadding: { top: 140, right: 40, bottom: 220, left: 40 },
            animated: true,
        });
    };

    // Helper function to strip HTML tags from instructions
    const stripHtml = (html: string): string => {
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    };


    // Helper function to get maneuver icon
    const getManeuverIcon = (maneuver?: string) => {
        if (!maneuver) return ArrowUp;
        const m = maneuver.toLowerCase();
        
        if (m.includes('uturn') || m.includes('u-turn')) return RotateCw;
        
        // Turns/Curves - We want generic arrows for the road
        // The rotation logic will handle the direction
        return ArrowUp;
    };

    const fetchAndCalculateRoutes = async () => {
        if (!originCoords || !destinationCoords) return;
        if (!mapsApiKey) {
            setRouteError('Maps API key is missing. Set Maps_API_KEY in .env.');
            return;
        }

        setIsRouting(true);
        setRouteError(null);
        try {
            const origin = originPlaceId
                ? `place_id:${originPlaceId}`
                : `${originCoords.latitude},${originCoords.longitude}`;
            const destination = destinationPlaceId
                ? `place_id:${destinationPlaceId}`
                : `${destinationCoords.latitude},${destinationCoords.longitude}`;
            const url =
                `https://maps.googleapis.com/maps/api/directions/json` +
                `?origin=${encodeURIComponent(origin)}` +
                `&destination=${encodeURIComponent(destination)}` +
                `&mode=${transportationMode}` +
                `&alternatives=true` +
                `&key=${encodeURIComponent(mapsApiKey)}`;

            const response = await fetch(url);
            const data = await response.json();
            if (data?.status && data.status !== 'OK') {
                const message = data?.error_message ? ` - ${data.error_message}` : '';
                setRouteError(`Directions error: ${data.status}${message}`);
            }
            const routes = Array.isArray(data.routes) ? data.routes : [];

            if (routes.length === 0) {
                setRouteError('No routes returned. Check API key restrictions and ensure Directions API is enabled.');
                return;
            }

            let fastest = null as typeof fastestRoute;
            let safest = null as typeof safestRoute;
            let selectedRoute = null as any;

            routes.forEach((route: any, index: number) => {
                const leg = route?.legs?.[0];
                const duration = leg?.duration?.value ?? Number.MAX_SAFE_INTEGER;
                const safetyScore = calculateSafetyScore(index);
                const coords = decodePolyline(route?.overview_polyline?.points || '');

                if (!fastest || duration < fastest.duration) {
                    fastest = { coordinates: coords, duration };
                    if (activeRoute === 'fast') selectedRoute = route;
                }
                if (!safest || safetyScore > safest.safetyScore) {
                    safest = { coordinates: coords, safetyScore };
                    if (activeRoute === 'safe') selectedRoute = route;
                }
            });

            // If a route is active, parse steps for navigation
            if (selectedRoute && activeRoute) {
                const leg = selectedRoute.legs?.[0];
                if (leg?.steps) {
                    const steps: NavigationStep[] = leg.steps.map((step: any) => ({
                        instruction: stripHtml(step.html_instructions || ''),
                        distance: step.distance || { text: '', value: 0 },
                        duration: step.duration || { text: '', value: 0 },
                        startLocation: {
                            lat: step.start_location?.lat || 0,
                            lng: step.start_location?.lng || 0,
                        },
                        endLocation: {
                            lat: step.end_location?.lat || 0,
                            lng: step.end_location?.lng || 0,
                        },
                        maneuver: step.maneuver,
                        polyline: step.polyline?.points || '',
                    }));
                    setNavigationSteps(steps);
                    setCurrentStepIndex(0);
                    
                    // Calculate remaining distance and duration
                    const totalDistance = leg.distance || { text: '', value: 0 };
                    const totalDuration = leg.duration || { text: '', value: 0 };
                    setRemainingDistance(totalDistance);
                    setRemainingDuration(totalDuration);
                }
            } else {
                setNavigationSteps([]);
                setRemainingDistance(null);
                setRemainingDuration(null);
            }

            setFastestRoute(fastest);
            setSafestRoute(safest);

            if (activeRoute === 'fast' && fastest) {
                fitToRoute(fastest.coordinates);
            }
            if (activeRoute === 'safe' && safest) {
                fitToRoute(safest.coordinates);
            }
        } catch (error) {
            console.error('Route fetch failed:', error);
            setRouteError('Failed to fetch directions. Please try again.');
        } finally {
            setIsRouting(false);
        }
    };

    const startNavigation = async () => {
        if (!navigationSteps.length || !activeRoute) return;
        
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
            setRouteError('Location permission required for navigation');
            return;
        }
        
        setIsNavigating(true);
        setCurrentStepIndex(0);
        
        // Start watching location
        locationWatchId.current = Geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, heading: gpsHeading, speed } = position.coords;
                const timestamp = position.timestamp || Date.now();
                
                // Calculate heading logic
                // Priority:
                // 1. Calculated Bearing (Course) if moving > 2m (Best for driving/navigation view "Course Up")
                // 2. GPS Compass Heading if available and stationary
                // 3. Keep previous heading
                let finalHeading = currentHeading;
                let dist = 0;

                if (prevLocation.current) {
                     dist = haversineDistance(
                         prevLocation.current.latitude,
                         prevLocation.current.longitude,
                         latitude,
                         longitude
                     );
                }
                
                if (prevLocation.current && dist > 2) {
                     // Moving: Calculate course vector
                     finalHeading = calculateBearing(
                         prevLocation.current.latitude,
                         prevLocation.current.longitude,
                         latitude,
                         longitude
                     );
                } else if (typeof gpsHeading === 'number' && gpsHeading >= 0) {
                    // Stationary or slow: Use compass
                    finalHeading = gpsHeading;
                }
                
                // Update refs and state
                prevLocation.current = { latitude, longitude, timestamp };
                setCurrentLocation({ latitude, longitude });
                setCurrentHeading(finalHeading);
                
                // Update map camera to follow user in "Course Up" mode (3D view)
                // "Waze-like" behavior: Tilt (pitch) and rotate to heading
                if (mapRef.current) {
                    mapRef.current.animateCamera({
                        center: { latitude, longitude },
                        heading: finalHeading,
                        pitch: 50, // Increased pitch for better 3D perspective
                        zoom: 19,  // Zoom level: Very Close (Street Detail)
                    }, { duration: 1000 });
                }
                
                // Check if user has reached current step using functional state update
                setCurrentStepIndex((currentIdx) => {
// ...existing code...
                    if (navigationSteps.length > currentIdx) {
                        const currentStep = navigationSteps[currentIdx];
                        const distanceToStep = haversineDistance(
                            latitude,
                            longitude,
                            currentStep.endLocation.lat,
                            currentStep.endLocation.lng
                        );
                        
                        // If within 50 meters of step end, move to next step
                        if (distanceToStep < 50 && currentIdx < navigationSteps.length - 1) {
                            const nextIdx = currentIdx + 1;
                            
                            // Update remaining distance/duration
                            let remainingDist = 0;
                            let remainingDur = 0;
                            for (let i = nextIdx; i < navigationSteps.length; i++) {
                                remainingDist += navigationSteps[i].distance.value;
                                remainingDur += navigationSteps[i].duration.value;
                            }
                            setRemainingDistance({
                                text: formatDistance(remainingDist),
                                value: remainingDist,
                            });
                            setRemainingDuration({
                                text: formatDuration(remainingDur),
                                value: remainingDur,
                            });
                            
                            return nextIdx;
                        }
                    }
                    return currentIdx;
                });
            },
            (error) => {
                console.error('Location watch error:', error);
                setRouteError('Location tracking error');
            },
            {
                enableHighAccuracy: true,
                distanceFilter: 10, // Update every 10 meters
                interval: 5000,
                fastestInterval: 2000,
            }
        );
    };

    const stopNavigation = () => {
        setIsNavigating(false);
        if (locationWatchId.current !== null) {
            Geolocation.clearWatch(locationWatchId.current);
            locationWatchId.current = null;
        }
    };

    // Helper functions
    const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    const formatDistance = (meters: number): string => {
        if (meters < 1000) {
            return `${Math.round(meters)} m`;
        }
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const hours = Math.floor(mins / 60);
        if (hours > 0) {
            return `${hours}h ${mins % 60}m`;
        }
        return `${mins}m`;
    };


    // Helper to calculate bearing between two points
    const calculateBearing = (startLat: number, startLng: number, endLat: number, endLng: number) => {
        const startLatRad = startLat * (Math.PI / 180);
        const startLngRad = startLng * (Math.PI / 180);
        const endLatRad = endLat * (Math.PI / 180);
        const endLngRad = endLng * (Math.PI / 180);

        const y = Math.sin(endLngRad - startLngRad) * Math.cos(endLatRad);
        const x = Math.cos(startLatRad) * Math.sin(endLatRad) -
                Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(endLngRad - startLngRad);
        
        const bearingRad = Math.atan2(y, x);
        const bearingDeg = (bearingRad * 180) / Math.PI;
        return (bearingDeg + 360) % 360; // Normalize to 0-360
    };

    // Cleanup location watch on unmount
    useEffect(() => {
// ...existing code...
        return () => {
            if (locationWatchId.current !== null) {
                Geolocation.clearWatch(locationWatchId.current);
            }
        };
    }, []);

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                customMapStyle={DARK_MAP_STYLE}
                initialRegion={{
                    latitude: DEFAULT_COORDS.latitude,
                    longitude: DEFAULT_COORDS.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }}
                showsUserLocation={isNavigating}
                showsMyLocationButton={false}
                onUserLocationChange={(e) => {
                    // Prevent automatic map centering on user location
                    // Only update currentLocation state, don't move map
                    if (e.nativeEvent.coordinate) {
                        setCurrentLocation({
                            latitude: e.nativeEvent.coordinate.latitude,
                            longitude: e.nativeEvent.coordinate.longitude,
                        });
                    }
                }}
            >
                {/* Heatmap Layer */}
                {heatmapPoints.length > 0 && (
                    <Heatmap
                        points={heatmapPoints}
                        radius={50}
                        opacity={0.7}
                        gradient={{
                            colors: ['#00ff88', '#ffcc00', '#ff6600', '#ff0040'],
                            startPoints: [0.1, 0.3, 0.6, 0.9],
                            colorMapSize: 256,
                        }}
                    />
                )}

                {/* Hazard Markers/Beacons */}
                {nearbyHazards
                    .filter(h => {
                        const lat = h.coordinates?.lat;
                        const long = h.coordinates?.long;
                        const isValid = 
                            typeof lat === 'number' && 
                            typeof long === 'number' && 
                            !isNaN(lat) && 
                            !isNaN(long) &&
                            lat !== 0 && 
                            long !== 0;
                        
                        if (!isValid) {
                            console.warn('Hazard missing or invalid coordinates:', h.id, { lat, long, coordinates: h.coordinates });
                        }
                        return isValid;
                    })
                    .map(hazard => {
                        const lat = hazard.coordinates!.lat;
                        const long = hazard.coordinates!.long;
                        return (
                            <Marker
                                key={hazard.id}
                                coordinate={{
                                    latitude: lat,
                                    longitude: long,
                                }}
                                anchor={{ x: 0.5, y: 0.5 }}
                                tracksViewChanges={true}
                                title={hazard.is_immediate ? `Danger: ${hazard.type}` : hazard.beacon_kind === 'report' ? `Report: ${hazard.type}` : 'Suspicious Activity'}
                                description={`Detected at ${new Date(hazard.detected_at).toLocaleTimeString()}`}
                            >
                                <AnimatedBeacon hazard={hazard} />
                            </Marker>
                        );
                    })}

                {/* Safe Route (Green) */}
                {activeRoute === 'safe' && safestRoute && (
                    <Polyline
                        coordinates={safestRoute.coordinates}
                        strokeColor="#00ff88"
                        strokeWidth={8}
                        lineJoin="round"
                        lineCap="round"
                        geodesic={true}
                    />
                )}


                {/* Fast Route (Blue) */}
                {activeRoute === 'fast' && fastestRoute && (
                    <Polyline
                        coordinates={fastestRoute.coordinates}
                        strokeColor="#1f6feb"
                        strokeWidth={8}
                        lineJoin="round"
                        lineCap="round"
                        geodesic={true}
                    />
                )}

                {/* Maneuver Markers (Seamless White Arrows on Road) */}
                {activeRoute && navigationSteps
                    .map((step, index) => ({ step, index }))
                    .filter(({ step, index }) => 
                        index >= currentStepIndex && 
                        step.maneuver && 
                        step.startLocation &&
                        step.polyline 
                    )
                    .map(({ step, index }, i) => {
                        // Better Heading Calculation:
                        // Instead of just Start->End, we use the first segment of the polyline
                        // to ensure the arrow points exactly in the initial direction of the turn/road.
                        let bearing = 0;
                        const points = decodePolyline(step.polyline);
                        
                        if (points.length >= 2) {
                            bearing = calculateBearing(
                                points[0].latitude,
                                points[0].longitude,
                                points[1].latitude,
                                points[1].longitude
                            );
                        } else {
                            // Fallback if polyline is too short (unlikely)
                            bearing = calculateBearing(
                                step.startLocation.lat,
                                step.startLocation.lng,
                                step.endLocation.lat,
                                step.endLocation.lng
                            );
                        }
                        
                        // For next maneuver, show slightly larger
                        const isNext = i === 0;

                        return (
                            <Marker
                                key={`maneuver-${index}`}
                                coordinate={{
                                    latitude: step.startLocation.lat,
                                    longitude: step.startLocation.lng,
                                }}
                                anchor={{ x: 0.5, y: 0.5 }}
                                flat={true} // Rotates with the map
                                rotation={bearing} // Aligns with road direction
                                tracksViewChanges={false} // Performance optimization for static markers
                                zIndex={isNext ? 99 : 10}
                            >
                                <ManeuverArrow isNext={isNext} />
                            </Marker>
                        );
                    })}

                {/* User Puck - Custom location marker for navigation mode */}
                {isNavigating && (
                    <Marker
                        coordinate={currentLocation}
                        anchor={{ x: 0.5, y: 0.5 }}
                        flat={true} // Puck lies flat on the map
                        zIndex={999}
                        rotation={currentHeading} // Rotate marker explicitly for Android
                    >
                        <UserPuck heading={0} />
                    </Marker>
                )}
            </MapView>


            {/* Top HUD */}
            <View style={styles.topHud}>
                <View style={styles.safetyBadge}>
                    <Shield size={16} color={zoneSafety > 70 ? '#00ff88' : '#ff0040'} />
                    <Text style={[styles.safetyText, { color: zoneSafety > 70 ? '#00ff88' : '#ff0040' }]}>
                        {zoneSafety}% Safe
                    </Text>
                </View>
                <View style={styles.hazardCount}>
                    <Text style={styles.hazardCountText}>
                        {nearbyCount} {nearbyCount === 1 ? 'hazard' : 'hazards'} nearby
                    </Text>
                </View>
            </View>
            
            {/* Debug info - Remove in production */}
            {__DEV__ && (
                <View style={styles.debugPanel}>
                    <Text style={styles.debugText}>
                        Hazards: {nearbyHazards.length}
                    </Text>
                    <Text style={styles.debugText}>
                        With Coords: {nearbyHazards.filter(h => h.coordinates?.lat && h.coordinates?.long).length}
                    </Text>
                    <Text style={styles.debugText}>
                        Origin: {originCoords ? `${originCoords.latitude.toFixed(4)}, ${originCoords.longitude.toFixed(4)}` : 'null'}
                    </Text>
                </View>
            )}

            {/* Navigation Controller - Hidden during active navigation */}
            {!isNavigating && (
                <View style={styles.navPanel}>
                    <View style={styles.inputsResultContainer}>
                        {/* Route Line Graphic */}
                        <View style={styles.routeGraphic}>
                            <View style={styles.originDot} />
                            <View style={styles.connectorLine} />
                            <View style={styles.destSquare} />
                        </View>
                        
                        <View style={styles.inputsColumn}>
                            {/* Origin Input */}
                            <View style={styles.inputWrapper}>
                                <GooglePlacesAutocomplete
                                    placeholder="Current Location"
                                    query={{
                                        key: mapsApiKey,
                                        language: 'en',
                                    }}
                                    styles={{
                                        textInput: styles.minimalInput,
                                        textInputContainer: { backgroundColor: 'transparent' },
                                        listView: styles.placesList,
                                        row: styles.placesRow,
                                        description: styles.placesDesc,
                                    }}
                                    onPress={(data, details = null) => {
                                        const loc = details?.geometry?.location;
                                        if (!loc) return;
                                        setOriginLabel(data.description);
                                        setOriginCoords({
                                            latitude: loc.lat,
                                            longitude: loc.lng,
                                        });
                                        setOriginPlaceId(details?.place_id || null);
                                    }}
                                    fetchDetails
                                    fields={['geometry', 'place_id', 'formatted_address'] as any}
                                    enablePoweredByContainer={false}
                                    debounce={250}
                                    textInputProps={{
                                        value: originLabel || '',
                                        onChangeText: (text: string) => setOriginLabel(text),
                                        placeholderTextColor: '#7b7b90',
                                    }}
                                />
                                <TouchableOpacity
                                    style={styles.gpsIconBtn}
                                    onPress={refreshCurrentLocation}
                                >
                                    <MapPin size={16} color="#00f5ff" />
                                </TouchableOpacity>
                            </View>
                            
                            <View style={styles.inputDivider} />

                            {/* Destination Input */}
                            <View style={styles.inputWrapper}>
                                <GooglePlacesAutocomplete
                                    placeholder="Where to?"
                                    query={{
                                        key: mapsApiKey,
                                        language: 'en',
                                    }}
                                    styles={{
                                        textInput: styles.minimalInput,
                                        textInputContainer: { backgroundColor: 'transparent' },
                                        listView: styles.placesList,
                                        row: styles.placesRow,
                                        description: styles.placesDesc,
                                    }}
                                    onPress={(data, details = null) => {
                                        const loc = details?.geometry?.location;
                                        if (!loc) return;
                                        setDestinationLabel(data.description);
                                        setDestinationCoords({
                                            latitude: loc.lat,
                                            longitude: loc.lng,
                                        });
                                        setDestinationPlaceId(details?.place_id || null);
                                    }}
                                    fetchDetails
                                    fields={['geometry', 'place_id', 'formatted_address'] as any}
                                    enablePoweredByContainer={false}
                                    debounce={250}
                                    textInputProps={{
                                        placeholderTextColor: '#7b7b90',
                                    }}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Controls Row */}
                    <View style={styles.controlsRow}>
                        <View style={styles.modeTabs}>
                            <TouchableOpacity
                                style={[styles.modeTab, transportationMode === 'driving' && styles.modeTabActive]}
                                onPress={() => {
                                    setTransportationMode('driving');
                                    setActiveRoute(null);
                                    setNavigationSteps([]);
                                }}
                            >
                                <Car size={18} color={transportationMode === 'driving' ? '#00f5ff' : '#606070'} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modeTab, transportationMode === 'walking' && styles.modeTabActive]}
                                onPress={() => {
                                    setTransportationMode('walking');
                                    setActiveRoute(null);
                                    setNavigationSteps([]);
                                }}
                            >
                                <User size={18} color={transportationMode === 'walking' ? '#00f5ff' : '#606070'} />
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity
                            style={[styles.goButton, isRouting && styles.goButtonDisabled]}
                            onPress={fetchAndCalculateRoutes}
                            disabled={isRouting || !originCoords || !destinationCoords || !mapsApiKey}
                        >
                            <Text style={styles.goButtonText}>{isRouting ? '...' : 'GO'}</Text>
                        </TouchableOpacity>
                    </View>
                    
                    {routeError && (
                        <Text style={styles.routeErrorText}>{routeError}</Text>
                    )}

                    {/* Route Selection */}
                    {(fastestRoute || safestRoute) && (
                        <View style={styles.routeTogglePanel}>
                            <TouchableOpacity
                                style={[
                                    styles.routeCard, 
                                    activeRoute === 'safe' && styles.routeCardActiveSafe
                                ]}
                                onPress={() => {
                                    const next = activeRoute === 'safe' ? null : 'safe';
                                    setActiveRoute(next);
                                    if (next === 'safe' && safestRoute) fitToRoute(safestRoute.coordinates);
                                }}
                            >
                                <View style={styles.routeCardHeader}>
                                    <Shield size={16} color={activeRoute === 'safe' ? '#0a0a0f' : '#00ff88'} />
                                    <Text style={[styles.routeCardTitle, activeRoute === 'safe' && styles.routeCardTextActive]}>Safe</Text>
                                </View>
                                <Text style={[styles.routeInfoText, activeRoute === 'safe' && styles.routeCardTextActive]}>
                                    {safestRoute ? `${safestRoute.safetyScore}% Safe` : '--'}
                                </Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                                style={[
                                    styles.routeCard, 
                                    activeRoute === 'fast' && styles.routeCardActiveFast
                                ]}
                                onPress={() => {
                                    const next = activeRoute === 'fast' ? null : 'fast';
                                    setActiveRoute(next);
                                    if (next === 'fast' && fastestRoute) fitToRoute(fastestRoute.coordinates);
                                }}
                            >
                                <View style={styles.routeCardHeader}>
                                    <Navigation size={16} color={activeRoute === 'fast' ? '#0a0a0f' : '#00f5ff'} />
                                    <Text style={[styles.routeCardTitle, activeRoute === 'fast' && styles.routeCardTextActive]}>Fast</Text>
                                </View>
                                <Text style={[styles.routeInfoText, activeRoute === 'fast' && styles.routeCardTextActive]}>
                                    {fastestRoute ? formatDuration(fastestRoute.duration) : '--'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Start Navigation Action */}
                    {activeRoute && navigationSteps.length > 0 && (
                        <TouchableOpacity
                            style={styles.startNavButton}
                            onPress={startNavigation}
                        >
                            <Navigation size={20} color="#0a0a0f" />
                            <Text style={styles.startNavButtonText}>Start Navigation</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Navigation Instructions Panel */}
            {isNavigating && navigationSteps.length > 0 && currentStepIndex < navigationSteps.length && (
                <View style={styles.navInstructionsPanel}>
                    <View style={styles.navInstructionsHeader}>
                        <View style={styles.navStepInfo}>
                            <Text style={styles.navStepNumber}>{currentStepIndex + 1} / {navigationSteps.length}</Text>
                            {remainingDistance && remainingDuration && (
                                <Text style={styles.navRemaining}>
                                    {remainingDistance.text} • {remainingDuration.text}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity
                            style={styles.closeNavButton}
                            onPress={stopNavigation}
                        >
                            <X size={18} color="#606070" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.navInstructionContent}>
                        {(() => {
                            const currentStep = navigationSteps[currentStepIndex];
                            const ManeuverIcon = getManeuverIcon(currentStep.maneuver);
                            return (
                                <>
                                    <View style={styles.navManeuverIcon}>
                                        <ManeuverIcon size={32} color="#00f5ff" />
                                    </View>
                                    <View style={styles.navInstructionText}>
                                        <Text style={styles.navInstructionMain}>
                                            {currentStep.instruction}
                                        </Text>
                                        <Text style={styles.navInstructionDistance}>
                                            {currentStep.distance.text} • {currentStep.duration.text}
                                        </Text>
                                    </View>
                                </>
                            );
                        })()}
                    </View>
                    {/* Next Step Preview */}
                    {currentStepIndex < navigationSteps.length - 1 && (
                        <View style={styles.nextStepPreview}>
                            <Text style={styles.nextStepLabel}>Next:</Text>
                            <Text style={styles.nextStepText} numberOfLines={1}>
                                {navigationSteps[currentStepIndex + 1].instruction}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {/* Center on User Button */}
            <TouchableOpacity
                style={styles.centerButton}
                onPress={() => {
                    // Center on current location if available, otherwise default coordinates
                    const centerCoords = currentLocation.latitude && currentLocation.longitude
                        ? currentLocation
                        : DEFAULT_COORDS;
                    
                    mapRef.current?.animateToRegion({
                        ...centerCoords,
                        latitudeDelta: 0.002, // Zoom level: Street (Closer) for clear view
                        longitudeDelta: 0.002,
                    });
                    
                    // Refresh hazards globally and update user location for safety score
                    setUserLocation(centerCoords.latitude, centerCoords.longitude);
                    fetchNearbyHazards(centerCoords.latitude, centerCoords.longitude);
                }}
            >
                <MapPin size={20} color="#00f5ff" />
            </TouchableOpacity>

            {/* Legend */}
            <View style={styles.legend}>
                <Text style={styles.legendTitle}>THREAT DENSITY</Text>
                <View style={styles.legendGradient}>
                    <View style={[styles.legendColor, { backgroundColor: '#00ff88' }]} />
                    <View style={[styles.legendColor, { backgroundColor: '#ffcc00' }]} />
                    <View style={[styles.legendColor, { backgroundColor: '#ff6600' }]} />
                    <View style={[styles.legendColor, { backgroundColor: '#ff0040' }]} />
                </View>
                <View style={styles.legendLabels}>
                    <Text style={styles.legendLabel}>Low</Text>
                    <Text style={styles.legendLabel}>High</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0f',
    },
    map: {
        flex: 1,
    },
    topHud: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    navPanel: {
        position: 'absolute',
        top: 80,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(15, 15, 20, 0.95)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        padding: 16,
        gap: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    inputsResultContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    routeGraphic: {
        width: 16,
        paddingTop: 12,
        paddingBottom: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    originDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#00f5ff',
        borderWidth: 2,
        borderColor: '#fff',
    },
    connectorLine: {
        width: 2,
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        marginVertical: 4,
        borderRadius: 1,
    },
    destSquare: {
        width: 12,
        height: 12,
        backgroundColor: '#ff0040',
        borderWidth: 2,
        borderColor: '#fff',
    },
    inputsColumn: {
        flex: 1,
        gap: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 8,
    },
    minimalInput: {
        flex: 1,
        height: 44,
        color: '#ffffff',
        fontSize: 14,
        paddingHorizontal: 12,
    },
    gpsIconBtn: {
        padding: 8,
    },
    inputDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginLeft: 12,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    modeTabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    modeTab: {
        padding: 10,
        borderRadius: 8,
    },
    modeTabActive: {
        backgroundColor: 'rgba(0, 245, 255, 0.15)',
    },
    placesList: {
        backgroundColor: 'rgba(10, 10, 20, 0.95)',
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.2)',
        borderRadius: 12,
        marginTop: 4,
    },
    placesRow: {
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    placesDesc: {
        color: '#d6f2ff',
    },
    routeErrorText: {
        color: '#ff6b6b',
        fontSize: 12,
        fontWeight: '600',
    },
    goButton: {
        alignSelf: 'flex-end',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 12,
        backgroundColor: '#00f5ff',
    },
    goButtonDisabled: {
        opacity: 0.6,
    },
    goButtonText: {
        color: '#0a0a0f',
        fontWeight: '700',
        fontSize: 12,
        letterSpacing: 2,
    },
    routeTogglePanel: {
        flexDirection: 'row',
        gap: 12,
    },
    safetyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
        gap: 6,
    },
    safetyText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'monospace',
    },
    hazardCount: {
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 204, 0, 0.3)',
    },
    hazardCountText: {
        color: '#ffcc00',
        fontSize: 12,
        fontFamily: 'monospace',
    },
    routeCard: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        gap: 6,
    },
    routeCardActiveSafe: {
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        borderColor: '#00ff88',
    },
    routeCardActiveFast: {
        backgroundColor: 'rgba(0, 245, 255, 0.1)',
        borderColor: '#00f5ff',
    },
    routeCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    routeCardTitle: {
        color: '#7b7b90',
        fontSize: 12,
        fontWeight: '600',
    },
    routeCardTextActive: {
        color: '#ffffff',
    },
    routeInfoText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'monospace',
    },
    centerButton: {
        position: 'absolute',
        bottom: 180,
        right: 20,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
    },
    legend: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
    },
    legendTitle: {
        color: '#606070',
        fontSize: 8,
        fontFamily: 'monospace',
        letterSpacing: 2,
        marginBottom: 8,
    },
    legendGradient: {
        flexDirection: 'row',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
    },
    legendColor: {
        flex: 1,
    },
    legendLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    legendLabel: {
        color: '#606070',
        fontSize: 8,
        fontFamily: 'monospace',
    },
    // Beacon Styles - Compact and precise
    beaconContainer: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    beaconRing: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        opacity: 0.6,
    },
    beaconRingDanger: {
        borderColor: '#ff0040',
        backgroundColor: 'transparent',
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 8,
    },
    beaconRingSuspicious: {
        borderColor: '#ffcc00',
        backgroundColor: 'transparent',
        shadowColor: '#ffcc00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 7,
        elevation: 7,
    },
    beaconGlow: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        opacity: 0.8,
    },
    beaconGlowDanger: {
        backgroundColor: '#ff0040',
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 10,
    },
    beaconGlowSuspicious: {
        backgroundColor: '#ffcc00',
        shadowColor: '#ffcc00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 8,
    },
    beaconCore: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        zIndex: 2,
    },
    beaconCoreDanger: {
        backgroundColor: '#ff0040',
        borderColor: '#ff6666',
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 8,
    },
    beaconCoreSuspicious: {
        backgroundColor: '#ffcc00',
        borderColor: '#ffdd44',
        shadowColor: '#ffcc00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 6,
    },
    beaconInner: {
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: 3,
        zIndex: 3,
    },
    beaconInnerDanger: {
        backgroundColor: '#ffffff',
        shadowColor: '#ff0040',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 6,
    },
    beaconInnerSuspicious: {
        backgroundColor: '#ffffff',
        shadowColor: '#ffcc00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 5,
    },
    // Purple beacon styles - User Reported Crimes (validated)
    beaconRingReport: {
        borderColor: '#a855f7',
        backgroundColor: 'transparent',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 7,
        elevation: 7,
    },
    beaconGlowReport: {
        backgroundColor: '#a855f7',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 8,
    },
    beaconCoreReport: {
        backgroundColor: '#a855f7',
        borderColor: '#c084fc',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 6,
    },
    beaconInnerReport: {
        backgroundColor: '#ffffff',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 5,
    },
    // Debug panel (development only)
    debugPanel: {
        position: 'absolute',
        bottom: 250,
        left: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 0, 64, 0.5)',
    },
    debugText: {
        color: '#ff0040',
        fontSize: 10,
        fontFamily: 'monospace',
        marginBottom: 2,
    },
    // Transportation Mode Selector - Deprecated (Replaced by modeTabs)

    // Navigation Controls
    navigationControls: {
        marginTop: 10,
    },
    startNavButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00f5ff',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    startNavButtonText: {
        color: '#0a0a0f',
        fontWeight: '700',
        fontSize: 14,
        letterSpacing: 1,
    },
    stopNavButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 0, 64, 0.2)',
        borderWidth: 1,
        borderColor: '#ff0040',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    stopNavButtonText: {
        color: '#ff0040',
        fontWeight: '700',
        fontSize: 14,
        letterSpacing: 1,
    },
    // Navigation Instructions Panel
    navInstructionsPanel: {
        position: 'absolute',
        bottom: 90, // Above tab bar
        left: 16,
        right: 16,
        backgroundColor: 'rgba(10, 10, 20, 0.95)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    navInstructionsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    navStepInfo: {
        flex: 1,
    },
    navStepNumber: {
        color: '#00f5ff',
        fontSize: 12,
        fontWeight: '700',
        fontFamily: 'monospace',
        letterSpacing: 1,
        marginBottom: 4,
    },
    navRemaining: {
        color: '#606070',
        fontSize: 11,
        fontFamily: 'monospace',
    },
    closeNavButton: {
        padding: 4,
    },
    navInstructionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 12,
    },
    navManeuverIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0, 245, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(0, 245, 255, 0.3)',
    },
    navInstructionText: {
        flex: 1,
    },
    navInstructionMain: {
        color: '#e6f7ff',
        fontSize: 16,
        fontWeight: '600',
        lineHeight: 22,
        marginBottom: 4,
    },
    navInstructionDistance: {
        color: '#7b7b90',
        fontSize: 12,
        fontFamily: 'monospace',
    },
    nextStepPreview: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    nextStepLabel: {
        color: '#606070',
        fontSize: 10,
        fontFamily: 'monospace',
        letterSpacing: 1,
    },
    nextStepText: {
        flex: 1,
        color: '#7b7b90',
        fontSize: 12,
    },
    puckContainer: {
        width: 80,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    puckCore: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#ffffff',
        borderWidth: 3,
        borderColor: '#00f5ff',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    puckInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#00f5ff',
    },
});


