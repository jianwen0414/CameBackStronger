import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, AppState, AppStateStatus, SafeAreaView, Animated, Easing } from 'react-native';
import { useAlertStore } from '../store/useAlertStore';
import { Shield, Navigation, Scan } from 'lucide-react-native';
import { useIsFocused } from '@react-navigation/native';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import GeospatialModule, { AnchorResult } from '../native/GeospatialModule';
import { GeospatialARView } from '../native/GeospatialARView';
import VolumetricMist from '../components/VolumetricMist';

const { width, height } = Dimensions.get('window');
const FOV_HALF = 30; // 60 degree horizontal FOV approx

export default function ScannerScreen() {
  const { zoneSafety, nearbyHazards, fetchNearbyHazards, setUserLocation } = useAlertStore();

  const isFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const isActive = isFocused && appState === 'active';

  const [heading, setHeading] = useState<number>(0);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [isGeospatialReady, setIsGeospatialReady] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [earthState, setEarthState] = useState<string>('UNKNOWN');
  const [failureReason, setFailureReason] = useState<string>('UNKNOWN');
  const [anchors, setAnchors] = useState<Record<string, AnchorResult>>({});
  const [hasAllPermissions, setHasAllPermissions] = useState(false);

  // Animations (UI)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // App state listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, []);

  // Permission Flow for ARCore (Camera + Fine Location)
  useEffect(() => {
    const checkPermissions = async () => {
      const camStatus = await request(PERMISSIONS.ANDROID.CAMERA);
      const locStatus = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

      if (camStatus === RESULTS.GRANTED && locStatus === RESULTS.GRANTED) {
        setHasAllPermissions(true);
      } else {
        console.warn("Camera or Location permission denied. ARCore requires both.");
      }
    };
    checkPermissions();
  }, []);

  // UI loops
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.linear })
    ).start();
  }, [pulseAnim, scanLineAnim]);

  // Initialize Geospatial API once when active AND when all permissions are granted
  useEffect(() => {
    if (isActive && hasAllPermissions) {
      GeospatialModule.initialize()
        .then(() => GeospatialModule.startTracking())
        .then(() => setIsGeospatialReady(true))
        .catch((err) => console.log('Geospatial Init Error:', err));
    }
    return () => {
      if (!isActive) {
        setIsGeospatialReady(false);
        setIsTracking(false);
        GeospatialModule.stopTracking().catch(() => { });
        GeospatialModule.destroy();
      }
    };
  }, [isActive, hasAllPermissions]);

  // Main Tracking Loop: ARCore VPS
  useEffect(() => {
    let pollId: ReturnType<typeof setInterval>;

    if (isActive && isGeospatialReady) {
      pollId = setInterval(async () => {
        try {
          // Get basic device pose
          const state = await GeospatialModule.getTrackingState();
          setIsTracking(state.isTracking);
          setEarthState(state.earthState || 'UNKNOWN');
          setFailureReason(state.failureReason || 'UNKNOWN');

          if (state.isTracking && state.latitude && state.longitude) {
            setLocation({ lat: state.latitude, lng: state.longitude });
            setHeading(state.heading || 0);

            // Update physical location constraints without hammering the network API
            setUserLocation(state.latitude, state.longitude);

            // For every fetched hazard, ask ARCore exactly where it is in 3D physical space
            const newAnchors: Record<string, AnchorResult> = {};
            for (const hazard of nearbyHazards) {
              try {
                const anchor = await GeospatialModule.getGeospatialAnchor(
                  hazard.coordinates.lat,
                  hazard.coordinates.long
                );
                newAnchors[hazard.id] = anchor;
              } catch (e) {
                // Not tracking or anchor unavailable
              }
            }
            setAnchors(newAnchors);
          }
        } catch (e) {
          setIsTracking(false);
        }
      }, 500); // 2 fps update for anchors is plenty
    }

    return () => clearInterval(pollId);
  }, [isActive, isGeospatialReady, nearbyHazards, fetchNearbyHazards]);

  const handleScan = () => {
    if (location) {
      fetchNearbyHazards(location.lat, location.lng);
    } else {
      // Mock fallback if GPS fails
      fetchNearbyHazards(4.647997, 101.111185);
    }
  };

  const renderCamera = () => {
    if (!hasAllPermissions) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Awaiting ARCore Permissions...</Text>
        </View>
      );
    }
    // Render the custom Native ARCore View instead of VisionCamera
    if (isActive) {
      return (
        <GeospatialARView style={StyleSheet.absoluteFill} />
      );
    }
    return null;
  };

  // Render Volumetric Mists
  const renderMists = () => {
    if (!location || nearbyHazards.length === 0 || !isTracking) return null;

    return nearbyHazards.map((hazard) => {
      const anchor = anchors[hazard.id];
      if (!anchor) return null;

      const { relativeBearingDegrees, distanceMeters, elevationAngleDegrees } = anchor;

      // Filter out artifacts wildly out of view. We render slight peripherals for immersion.
      if (Math.abs(relativeBearingDegrees) > FOV_HALF * 1.5) {
        return null;
      }

      // X Projection: -30deg (left) to +30deg (right) roughly fits screen width natively
      const xPixel = (width / 2) + ((relativeBearingDegrees / FOV_HALF) * (width / 2));

      // Y Projection: elevation angle + artificial slight sink for distance
      const yPixel = (height / 2) - ((elevationAngleDegrees / FOV_HALF) * (height / 2)) + (distanceMeters * 0.1);

      const isImmediate = hazard.is_immediate || hazard.beacon_kind === 'immediate';
      const primaryColor = isImmediate ? '#FF0040' : hazard.beacon_kind === 'suspicious' ? '#FFCC00' : '#8B00FF';

      return (
        <View key={hazard.id} style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <VolumetricMist
            xPixel={xPixel}
            yPixel={yPixel}
            distance={distanceMeters}
            color={primaryColor}
          />
          {distanceMeters < 300 && Math.abs(relativeBearingDegrees) < FOV_HALF && (
            <View style={[styles.mistLabel, { left: xPixel - 50, top: yPixel + (200 / Math.max(2, distanceMeters)) }]}>
              <Text style={[styles.mistTypeText, { color: primaryColor }]}>
                {hazard.type ? hazard.type.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN'}
              </Text>
              <Text style={[styles.mistText, { color: primaryColor }]}>
                {Math.round(distanceMeters)}m
              </Text>
            </View>
          )}
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      {renderCamera()}
      <View style={styles.overlay} />
      <View style={styles.gridBackground} />

      {/* AR Hazards Layer */}
      <View style={styles.mistsLayer}>
        {renderMists()}
      </View>

      {/* HUD Layer */}
      <SafeAreaView style={styles.hudContainer} pointerEvents="box-none">
        {/* Top Floating Metrics */}
        <View style={styles.topHudRow} pointerEvents="none">
          <View style={styles.glassPill}>
            <Shield size={16} color={zoneSafety > 80 ? "#22c55e" : "#ef4444"} />
            <Text style={styles.hudText}>SAFETY SCORE: {zoneSafety}%</Text>
          </View>

          <View style={styles.hazardPill}>
            <Navigation size={16} color={isTracking ? "#22c55e" : "#ef4444"} />
            <Text style={styles.hudText}>{isTracking ? "AR ACTIVE" : "CALIBRATING"}</Text>
          </View>
        </View>

        {/* Center Reticle */}
        <View style={styles.reticle} pointerEvents="none">
          <View style={styles.reticleCornerTL} />
          <View style={styles.reticleCornerTR} />
          <View style={styles.reticleCornerBL} />
          <View style={styles.reticleCornerBR} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 100] }) }] }]} />
        </View>

        {/* DEBUG HUD FOR DIAGNOSING MIST CULLING */}
        <View style={{ position: 'absolute', top: 180, left: 20, backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 10 }}>
          <Text style={{ color: 'lime', fontSize: 10 }}>Location Set: {location ? 'YES' : 'NO'}</Text>
          <Text style={{ color: 'lime', fontSize: 10 }}>Nearby Hazards: {nearbyHazards.length}</Text>
          <Text style={{ color: 'lime', fontSize: 10 }}>Is Tracking: {isTracking ? 'YES' : 'NO'}</Text>
          <Text style={{ color: 'orange', fontSize: 10 }}>Earth State: {earthState}</Text>
          <Text style={{ color: 'lime', fontSize: 10 }}>Anchors Found: {Object.keys(anchors).length}</Text>
          {Object.entries(anchors).map(([id, anchor]) => (
            <Text key={id} style={{ color: 'cyan', fontSize: 8 }}>
              Dist: {Math.round(anchor.distanceMeters)}m, Brg: {Math.round(anchor.relativeBearingDegrees)}°, yElev: {Math.round(anchor.elevationAngleDegrees)}°
            </Text>
          ))}
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          <View style={styles.headingIndicator}>
            <Text style={styles.headingText}>{Math.round(heading)}° {isTracking ? "TRUE" : "..."}</Text>
          </View>
          <TouchableOpacity style={styles.scanButton} onPress={handleScan} activeOpacity={0.8}>
            <Animated.View style={[styles.scanButtonInner, { transform: [{ scale: pulseAnim }] }]}>
              <Scan size={28} color="#000" />
            </Animated.View>
          </TouchableOpacity>
          <Text style={styles.scanLabel}>TAP TO SCAN AREA</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  gridBackground: { ...StyleSheet.absoluteFillObject, opacity: 0.1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#09090B' },
  errorText: { color: '#ef4444', fontSize: 16, marginBottom: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  mistsLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  mistLabel: { position: 'absolute', backgroundColor: 'rgba(24,24,27,0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  mistTypeText: { fontSize: 11, fontWeight: '800', textAlign: 'center', marginBottom: 2, letterSpacing: 0.5 },
  mistText: { fontSize: 10, fontWeight: '600', textAlign: 'center', opacity: 0.8 },
  hudContainer: { flex: 1, justifyContent: 'space-between' },
  topHudRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 60 },
  glassPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24
  },
  hazardPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24
  },
  hudText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12, letterSpacing: 0.5 },
  reticle: { position: 'absolute', top: height / 2 - 120, left: width / 2 - 120, width: 240, height: 240, opacity: 0.5, justifyContent: 'center', alignItems: 'center' },
  reticleCornerTL: { position: 'absolute', top: 0, left: 0, width: 24, height: 24, borderTopWidth: 2, borderLeftWidth: 2, borderColor: '#FFFFFF', borderTopLeftRadius: 12 },
  reticleCornerTR: { position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#FFFFFF', borderTopRightRadius: 12 },
  reticleCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 24, height: 24, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: '#FFFFFF', borderBottomLeftRadius: 12 },
  reticleCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#FFFFFF', borderBottomRightRadius: 12 },
  scanLine: { width: '100%', height: 1, backgroundColor: '#FFFFFF', opacity: 0.5 },
  headingIndicator: { marginBottom: 16, backgroundColor: 'rgba(24, 24, 27, 0.85)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  headingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  bottomControls: { alignItems: 'center', paddingBottom: 140, gap: 8 },
  scanButton: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center' },
  scanButtonInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#FFF', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  scanLabel: { color: '#A1A1AA', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 4 }
});
