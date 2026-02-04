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
} from 'react-native';
import MapView, { Heatmap, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { MapPin, Navigation, Shield } from 'lucide-react-native';
import Config from 'react-native-config';
import Geolocation from '@react-native-community/geolocation';
import polyline from '@mapbox/polyline';
import { useAlertStore } from '../store/useAlertStore';

const { width, height } = Dimensions.get('window');

// Dark mode map style
const DARK_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#0a0a0f' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#606070' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0f' }] },
    {
        featureType: 'administrative',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1a1a25' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#1a1a25' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#12121a' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#2a2a35' }],
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#0d1b2a' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#0d1a0d' }],
    },
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

export default function MapScreen() {
    const mapRef = useRef<MapView>(null);
    const [currentLocation, setCurrentLocation] = useState({
        latitude: 3.1390,
        longitude: 101.6869,
    });
    const [activeRoute, setActiveRoute] = useState<RouteType>(null);
    const [originLabel, setOriginLabel] = useState('Current Location');
    const [originCoords, setOriginCoords] = useState<{
        latitude: number;
        longitude: number;
    } | null>(null);
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

    const { nearbyHazards, fetchNearbyHazards, zoneSafety } = useAlertStore();
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
            setRouteError('Location permission denied');
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
                setRouteError('Unable to get GPS location. Check device location settings.');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    };

    // Get current location
    useEffect(() => {
        refreshCurrentLocation();
    }, [fetchNearbyHazards]);

    // Convert hazards to heatmap points
    const heatmapPoints = nearbyHazards
        .filter(h => h.coordinates?.lat && h.coordinates?.long)
        .map(h => ({
            latitude: h.coordinates.lat,
            longitude: h.coordinates.long,
            weight: h.is_immediate ? 1 : 0.5,
        }));

    const decodePolyline = (encoded: string) =>
        polyline.decode(encoded).map(point => ({
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

            routes.forEach((route: any, index: number) => {
                const leg = route?.legs?.[0];
                const duration = leg?.duration?.value ?? Number.MAX_SAFE_INTEGER;
                const safetyScore = calculateSafetyScore(index);
                const coords = decodePolyline(route?.overview_polyline?.points || '');

                if (!fastest || duration < fastest.duration) {
                    fastest = { coordinates: coords, duration };
                }
                if (!safest || safetyScore > safest.safetyScore) {
                    safest = { coordinates: coords, safetyScore };
                }
            });

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
        } finally {
            setIsRouting(false);
        }
    };

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                customMapStyle={DARK_MAP_STYLE}
                initialRegion={{
                    latitude: currentLocation.latitude,
                    longitude: currentLocation.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }}
                showsUserLocation
                showsMyLocationButton={false}
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
                    <Text style={styles.hazardCountText}>{nearbyHazards.length} hazards nearby</Text>
                </View>
            </View>

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
                            fields={['geometry', 'place_id', 'formatted_address']}
                            enablePoweredByContainer={false}
                            debounce={250}
                            textInputProps={{
                                value: originLabel,
                                onChangeText: text => setOriginLabel(text),
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
                        fields={['geometry', 'place_id', 'formatted_address']}
                        enablePoweredByContainer={false}
                        debounce={250}
                    />
                </View>
                {routeError && (
                    <Text style={styles.routeErrorText}>{routeError}</Text>
                )}
                <TouchableOpacity
                    style={[styles.goButton, isRouting && styles.goButtonDisabled]}
                    onPress={fetchAndCalculateRoutes}
                    disabled={isRouting || !originCoords || !destinationCoords || !mapsApiKey}
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
            </View>

            {/* Center on User Button */}
            <TouchableOpacity
                style={styles.centerButton}
                onPress={() => {
                    mapRef.current?.animateToRegion({
                        ...currentLocation,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    });
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
        backgroundColor: 'rgba(10, 10, 20, 0.72)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.25)',
        padding: 12,
        gap: 10,
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
});
