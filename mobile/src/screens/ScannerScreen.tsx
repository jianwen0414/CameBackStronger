import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Easing } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useAlertStore } from '../store/useAlertStore';
import { Shield, Navigation, Scan } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// Mock path data for SVG (Green Path)
const pathData = `M${width * 0.2} ${height * 0.8} C${width * 0.4} ${height * 0.6}, ${width * 0.6} ${height * 0.7}, ${width * 0.8} ${height * 0.4}`;

export default function ScannerScreen() {
  const { zoneSafety, nearbyHazards, fetchNearbyHazards } = useAlertStore();
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation for scan button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    ).start();

    // Scan line animation
    Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
        easing: Easing.linear,
      })
    ).start();
  }, []);

  const handleScan = () => {
    // Mock scan - fetch nearby hazards (you can use actual geolocation here)
    fetchNearbyHazards(4.647997024420677, 101.11118512535789, 1000);
  };

  return (
    <View style={styles.container}>
      {/* Dark Background with Grid Pattern */}
      <View style={styles.gridBackground} />

      {/* SVG Layer - Green Path */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#00FF88" stopOpacity="1" />
              <Stop offset="1" stopColor="#00F0FF" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          
          {/* Outer Glow */}
          <Path
            d={pathData}
            stroke="#00FF88"
            strokeWidth="10"
            strokeOpacity="0.3"
            fill="none"
          />
          
          {/* Inner Core */}
          <Path
            d={pathData}
            stroke="url(#grad)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />

          {/* Scan Line Animation (simulated) */}
          <Circle
            cx={width * 0.5}
            cy={height * 0.5}
            r="100"
            stroke="#00F0FF"
            strokeWidth="2"
            strokeOpacity="0.5"
            fill="none"
          />
        </Svg>
      </View>

      {/* HUD Layer */}
      <View style={styles.hudContainer}>
        {/* Top Left: Safety Score */}
        <View style={styles.glassPill}>
          <Shield size={16} color={zoneSafety > 80 ? "#00FF88" : "#FF0040"} />
          <Text style={styles.hudText}>SAFETY SCORE: {zoneSafety}%</Text>
        </View>

        {/* Top Right: Hazard Count */}
        <View style={styles.hazardPill}>
          <Navigation size={16} color="#FFCC00" />
          <Text style={styles.hudText}>{nearbyHazards.length} THREATS NEARBY</Text>
        </View>

        {/* Center Target Reticle */}
        <View style={styles.reticle}>
          <View style={styles.reticleCornerTL} />
          <View style={styles.reticleCornerTR} />
          <View style={styles.reticleCornerBL} />
          <View style={styles.reticleCornerBR} />
          
          {/* Scanning Line */}
          <Animated.View 
            style={[
              styles.scanLine,
              {
                transform: [{
                  translateY: scanLineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-100, 100],
                  }),
                }],
              },
            ]}
          />
        </View>

        {/* Bottom Action */}
        <View style={styles.bottomControls}>
          <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
            <Animated.View style={[styles.scanButtonInner, { transform: [{ scale: pulseAnim }] }]}>
              <Scan size={32} color="#020204" />
            </Animated.View>
            <View style={styles.scanButtonGlow} />
          </TouchableOpacity>
          <Text style={styles.scanLabel}>TAP TO SCAN AREA</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020204',
  },
  gridBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
    // Grid pattern simulation via border (actual grid would need SVG or Image)
  },
  hudContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20, 20, 25, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
    alignSelf: 'flex-start',
    marginTop: 40,
  },
  hazardPill: {
    position: 'absolute',
    top: 64,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20, 20, 25, 0.6)',
    borderColor: 'rgba(255, 204, 0, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
  },
  hudText: {
    color: '#FFF',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 12,
  },
  reticle: {
    position: 'absolute',
    top: height / 2 - 100,
    left: width / 2 - 100,
    width: 200,
    height: 200,
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.3)',
    borderRadius: 20,
    opacity: 0.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticleCornerTL: { position: 'absolute', top: -1, left: -1, width: 20, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderColor: '#00F0FF' },
  reticleCornerTR: { position: 'absolute', top: -1, right: -1, width: 20, height: 20, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#00F0FF' },
  reticleCornerBL: { position: 'absolute', bottom: -1, left: -1, width: 20, height: 20, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: '#00F0FF' },
  reticleCornerBR: { position: 'absolute', bottom: -1, right: -1, width: 20, height: 20, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#00F0FF' },
  scanLine: {
    width: '100%',
    height: 2,
    backgroundColor: '#00F0FF',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  bottomControls: {
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
  },
  scanButton: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  scanButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00F0FF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  scanButtonGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#00F0FF',
    opacity: 0.3,
    zIndex: 1,
  },
  scanLabel: {
    color: '#00F0FF',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 2,
  },
});
