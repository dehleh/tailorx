import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Theme } from '../constants/theme';

// Screens
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import MeasurementsScreen from '../screens/MeasurementsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: Theme.colors.primary,
          tabBarInactiveTintColor: Theme.colors.text.secondary,
          tabBarStyle: {
            backgroundColor: Theme.colors.white,
            borderTopWidth: 1,
            borderTopColor: Theme.colors.border,
            paddingBottom: 8,
            paddingTop: 8,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: Theme.colors.white,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: Theme.colors.border,
          },
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '700',
            color: Theme.colors.text.primary,
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} />,
            headerShown: false,
          }}
        />
        <Tab.Screen
          name="Camera"
          component={CameraScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon icon="📸" color={color} />,
            headerShown: false,
          }}
        />
        <Tab.Screen
          name="Measurements"
          component={MeasurementsScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon icon="📏" color={color} />,
            title: 'My Measurements',
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

interface TabIconProps {
  icon: string;
  color: string;
}

function TabIcon({ icon, color }: TabIconProps) {
  return <Text style={{ fontSize: 24, opacity: color === Theme.colors.primary ? 1 : 0.5 }}>{icon}</Text>;
}
