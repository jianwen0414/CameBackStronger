/**
 * NightWalk Mobile - Main App with Tab Navigation
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { Scan, Map, Bell } from 'lucide-react-native';

import ScannerScreen from './src/screens/ScannerScreen';
import MapScreen from './src/screens/MapScreen';
import AlertsScreen from './src/screens/AlertsScreen';

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

export default function App() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: '#00f5ff',
          background: '#0a0a0f',
          card: '#12121a',
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
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#00f5ff',
          tabBarInactiveTintColor: '#606070',
          tabBarLabelStyle: styles.tabLabel,
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
            tabBarBadge: undefined, // Can be set to show notification count
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#12121a',
    borderTopColor: 'rgba(0, 245, 255, 0.1)',
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 10,
    paddingTop: 10,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  tabGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.15,
    zIndex: -1,
  },
});
