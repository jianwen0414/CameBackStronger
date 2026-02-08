/**
 * NightWalk Mobile - Main App with Tab Navigation
 */
import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, StatusBar } from 'react-native';
import { Scan, Map, Bell, FileWarning } from 'lucide-react-native';

import AuthScreen from './src/screens/AuthScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import MapScreen from './src/screens/MapScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ReportCrimeScreen from './src/screens/ReportCrimeScreen';

const Tab = createBottomTabNavigator();

// Custom tab bar icon with glow effect
function TabIcon({
  Icon,
  focused,
  color
}: {
  Icon: React.ComponentType<{ size: number; color: string }>;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={[styles.tabIconContainer, focused && styles.tabIconFocused]}>
      <Icon size={22} color={color} />
      {focused && <View style={[styles.tabGlow, { backgroundColor: color }]} />}
    </View>
  );
}

function MainApp() {
  return (
    <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#00f5ff',
          tabBarInactiveTintColor: '#606070',
          tabBarLabelStyle: styles.tabLabel,
          tabBarBackground: () => (
            <View style={StyleSheet.absoluteFill} />
          ),
        }}
      >
        <Tab.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <TabIcon Icon={Scan} focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <TabIcon Icon={Map} focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Alerts"
          component={AlertsScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <TabIcon Icon={Bell} focused={focused} color={color} />
            ),
            tabBarBadge: undefined,
          }}
        />
        <Tab.Screen
          name="Report"
          component={ReportCrimeScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <TabIcon Icon={FileWarning} focused={focused} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: '#00f5ff',
          background: '#020204',
          card: '#141419', // Glass Graphite equivalent opacity check
          text: '#ffffff',
          border: 'rgba(255, 255, 255, 0.1)',
          notification: '#ff0040',
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor="#020204" />
      {isAuthenticated ? (
        <MainApp />
      ) : (
        <AuthScreen onLoginSuccess={() => setIsAuthenticated(true)} />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(20, 20, 25, 0.95)',
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 20,
    paddingTop: 10,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 0,
    borderTopWidth: 0, // Clean look
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 40,
    width: 40,
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    opacity: 0.2,
    zIndex: -1,
  },
});
