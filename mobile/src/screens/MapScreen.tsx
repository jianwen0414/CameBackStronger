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
import MapView, { Heatmap, Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { MapPin, Navigation, Shield, Car, User, X, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, RotateCw } from 'lucide-react-native';
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

// Animated Beacon Component
function AnimatedBeacon({ hazard }: { hazard: any }) {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.8)).current;
    
    useEffect(() => {
        // Create pulsing animation - subtle pulse for smaller beacons
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
        
        // Create opacity animation
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
                    hazard.is_immediate ? styles.beaconRingDanger : styles.beaconRingSuspicious,
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
                    hazard.is_immediate ? styles.beaconGlowDanger : styles.beaconGlowSuspicious,
                    {
                        opacity: opacityAnim,
                    }
                ]}
            />
            {/* Core */}
            <View
                style={[
                    styles.beaconCore,
                    hazard.is_immediate ? styles.beaconCoreDanger : styles.beaconCoreSuspicious,
                ]}
            />
            {/* Inner highlight */}
            <View
                style={[
                    styles.beaconInner,
                    hazard.is_immediate ? styles.beaconInnerDanger : styles.beaconInnerSuspicious,
                ]}
            />
        </Animated.View>
    );
}

export default function MapScreen() {
    const mapRef = useRef<MapView>(null);
    const locationWatchId = useRef<number | null>(null);
    const [currentLocation, setCurrentLocation] = useState(DEFAULT_COORDS);
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

    const { nearbyHazards, fetchNearbyHazards, zoneSafety, subscribeToAlerts } = useAlertStore();
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
            fetchNearbyHazards(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude, 1000);
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
                fetchNearbyHazards(latitude, longitude, 1000);
                setOriginLabel('Current Location');
                setOriginCoords({ latitude, longitude });
                setOriginPlaceId(null);
                setRouteError(null);

                mapRef.current?.animateToRegion({
                    latitude,
                    longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });
            },
            error => {
                console.error('Location error:', error);
                // On GPS error, use default coordinates
                setCurrentLocation(DEFAULT_COORDS);
                fetchNearbyHazards(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude, 1000);
                setOriginLabel('Default Location');
                setOriginCoords(DEFAULT_COORDS);
                setOriginPlaceId(null);
                setRouteError('Unable to get GPS location. Using default location.');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    };

    // Initialize: Center map and fetch hazards
    useEffect(() => {
        // Center map on default coordinates first
        mapRef.current?.animateToRegion({
            latitude: DEFAULT_COORDS.latitude,
            longitude: DEFAULT_COORDS.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        });
        
        // Fetch hazards for default location immediately
        fetchNearbyHazards(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude, 1000);
        
        // Subscribe to real-time alerts
        const unsubscribe = subscribeToAlerts();
        
        // Note: GPS location is only fetched when user clicks "Use GPS" button
        // This prevents automatic override of default location
        
        return () => {
            unsubscribe();
        };
    }, []);

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
        if (!maneuver) return ArrowRight;
        const m = maneuver.toLowerCase();
        if (m.includes('left')) return ArrowLeft;
        if (m.includes('right')) return ArrowRight;
        if (m.includes('straight') || m.includes('continue')) return ArrowUp;
        if (m.includes('uturn') || m.includes('u-turn')) return RotateCw;
        return ArrowRight;
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
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ latitude, longitude });
                
                // Update map to follow user
                if (mapRef.current) {
                    mapRef.current.animateToRegion({
                        latitude,
                        longitude,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                    }, 1000);
                }
                
                // Check if user has reached current step using functional state update
                setCurrentStepIndex((currentIdx) => {
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

    // Cleanup location watch on unmount
    useEffect(() => {
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
                                title={hazard.is_immediate ? `Danger: ${hazard.type}` : 'Suspicious Activity'}
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
                        strokeWidth={5}
                    />
                )}

                {/* Fast Route (Blue) */}
                {activeRoute === 'fast' && fastestRoute && (
                    <Polyline
                        coordinates={fastestRoute.coordinates}
                        strokeColor="#1f6feb"
                        strokeWidth={5}
                    />
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
                        {nearbyHazards.length} {nearbyHazards.length === 1 ? 'hazard' : 'hazards'} nearby
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

            {/* Navigation Controller */}
            <View style={styles.navPanel}>
                <View style={styles.navRow}>
                    <View style={styles.navLabel}>
                        <Text style={styles.navLabelText}>Origin</Text>
                    </View>
                    <View style={styles.navInputWrapper}>
                        <GooglePlacesAutocomplete
                            placeholder="Current Location"
                            query={{
                                key: mapsApiKey,
                                language: 'en',
                            }}
                            styles={{
                                textInput: styles.navInput,
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
                            }}
                        />
                        <TouchableOpacity
                            style={styles.gpsButton}
                            onPress={refreshCurrentLocation}
                        >
                            <Text style={styles.gpsButtonText}>Use GPS</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.navRow}>
                    <View style={styles.navLabel}>
                        <Text style={styles.navLabelText}>Destination</Text>
                    </View>
                    <GooglePlacesAutocomplete
                        placeholder="Search destination"
                        query={{
                            key: mapsApiKey,
                            language: 'en',
                        }}
                        styles={{
                            textInput: styles.navInput,
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
                    />
                </View>
                {/* Transportation Mode Selector */}
                <View style={styles.modeSelector}>
                    <Text style={styles.modeLabel}>Mode:</Text>
                    <TouchableOpacity
                        style={[styles.modeButton, transportationMode === 'driving' && styles.modeButtonActive]}
                        onPress={() => {
                            if (isNavigating) stopNavigation();
                            setTransportationMode('driving');
                            setActiveRoute(null);
                            setNavigationSteps([]);
                        }}
                    >
                        <Car size={16} color={transportationMode === 'driving' ? '#0a0a0f' : '#606070'} />
                        <Text style={[styles.modeButtonText, transportationMode === 'driving' && styles.modeButtonTextActive]}>
                            Driving
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, transportationMode === 'walking' && styles.modeButtonActive]}
                        onPress={() => {
                            if (isNavigating) stopNavigation();
                            setTransportationMode('walking');
                            setActiveRoute(null);
                            setNavigationSteps([]);
                        }}
                    >
                        <User size={16} color={transportationMode === 'walking' ? '#0a0a0f' : '#606070'} />
                        <Text style={[styles.modeButtonText, transportationMode === 'walking' && styles.modeButtonTextActive]}>
                            Walking
                        </Text>
                    </TouchableOpacity>
                </View>
                {routeError && (
                    <Text style={styles.routeErrorText}>{routeError}</Text>
                )}
                <TouchableOpacity
                    style={[styles.goButton, isRouting && styles.goButtonDisabled]}
                    onPress={fetchAndCalculateRoutes}
                    disabled={isRouting || !originCoords || !destinationCoords || !mapsApiKey || isNavigating}
                >
                    <Text style={styles.goButtonText}>{isRouting ? 'ROUTING...' : 'GO'}</Text>
                </TouchableOpacity>
                <View style={styles.routeTogglePanel}>
                    <TouchableOpacity
                        style={[styles.routeButton, activeRoute === 'safe' && styles.routeButtonActive]}
                        onPress={() => {
                            const next = activeRoute === 'safe' ? null : 'safe';
                            setActiveRoute(next);
                            if (next === 'safe' && safestRoute) {
                                fitToRoute(safestRoute.coordinates);
                            }
                        }}
                    >
                        <Shield size={18} color={activeRoute === 'safe' ? '#0a0a0f' : '#00ff88'} />
                        <Text style={[styles.routeButtonText, activeRoute === 'safe' && styles.routeButtonTextActive]}>
                            Safe Route
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.routeButton, activeRoute === 'fast' && styles.routeButtonActiveFast]}
                        onPress={() => {
                            const next = activeRoute === 'fast' ? null : 'fast';
                            setActiveRoute(next);
                            if (next === 'fast' && fastestRoute) {
                                fitToRoute(fastestRoute.coordinates);
                            }
                        }}
                    >
                        <Navigation size={18} color={activeRoute === 'fast' ? '#0a0a0f' : '#606070'} />
                        <Text style={[styles.routeButtonText, activeRoute === 'fast' && styles.routeButtonTextActive]}>
                            Fastest Route
                        </Text>
                    </TouchableOpacity>
                </View>
                {/* Navigation Controls */}
                {activeRoute && navigationSteps.length > 0 && (
                    <View style={styles.navigationControls}>
                        {!isNavigating ? (
                            <TouchableOpacity
                                style={styles.startNavButton}
                                onPress={startNavigation}
                            >
                                <Navigation size={18} color="#0a0a0f" />
                                <Text style={styles.startNavButtonText}>Start Navigation</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.stopNavButton}
                                onPress={stopNavigation}
                            >
                                <X size={18} color="#ff0040" />
                                <Text style={styles.stopNavButtonText}>Stop Navigation</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>

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
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    });
                    
                    // Refresh hazards for the centered location
                    fetchNearbyHazards(centerCoords.latitude, centerCoords.longitude, 1000);
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
        top: 70,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(20, 20, 25, 0.6)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        padding: 12,
        gap: 10,
        // Backdrop blur effect is handled by native modules usually, keeping alpha bg for now
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    navInputWrapper: {
        flex: 1,
    },
    navLabel: {
        width: 110,
    },
    navLabelText: {
        color: '#7b7b90',
        fontSize: 11,
        fontFamily: 'monospace',
        letterSpacing: 1,
    },
    navInput: {
        flex: 1,
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: '#e6f7ff',
        fontSize: 13,
    },
    gpsButton: {
        alignSelf: 'flex-end',
        marginTop: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
        backgroundColor: 'rgba(0, 245, 255, 0.12)',
    },
    gpsButtonText: {
        color: '#00f5ff',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
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
    routeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
        gap: 8,
    },
    routeButtonActive: {
        backgroundColor: '#00ff88',
        borderColor: '#00ff88',
    },
    routeButtonActiveFast: {
        backgroundColor: '#606070',
        borderColor: '#606070',
    },
    routeButtonText: {
        color: '#a0a0b0',
        fontSize: 14,
        fontWeight: '600',
    },
    routeButtonTextActive: {
        color: '#0a0a0f',
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
    // Transportation Mode Selector
    modeSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    modeLabel: {
        color: '#7b7b90',
        fontSize: 11,
        fontFamily: 'monospace',
        letterSpacing: 1,
        width: 50,
    },
    modeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 10, 20, 0.9)',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.3)',
        gap: 6,
    },
    modeButtonActive: {
        backgroundColor: '#00f5ff',
        borderColor: '#00f5ff',
    },
    modeButtonText: {
        color: '#606070',
        fontSize: 12,
        fontWeight: '600',
    },
    modeButtonTextActive: {
        color: '#0a0a0f',
    },
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
});
