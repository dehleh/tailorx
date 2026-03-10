import React from 'react';
import { Text, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RootStackParamList, RootTabParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';

// Auth screens
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import PhoneAuthScreen from '../screens/PhoneAuthScreen';
import OTPVerificationScreen from '../screens/OTPVerificationScreen';
import GettingStartedScreen from '../screens/GettingStartedScreen';
import PrivacyConsentScreen from '../screens/PrivacyConsentScreen';

// Main screens
import HomeScreen from '../screens/HomeScreen';
import MeasurementsScreen from '../screens/MeasurementsScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Stack navigators
import ScanStackNavigator from './ScanStackNavigator';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600' as const,
        },
        headerStyle: {
          backgroundColor: Colors.white,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '700' as const,
          color: Colors.text.primary,
        },
        headerShadowVisible: false,
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
        name="Scan"
        component={ScanStackNavigator}
        options={{
          tabBarIcon: ({ color }) => <TabIcon icon="📸" color={color} />,
          headerShown: false,
          tabBarLabel: 'Scan',
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
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isOnboarded, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.secondary }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          {isAuthenticated && isOnboarded ? (
            <RootStack.Screen name="MainTabs" component={MainTabs} />
          ) : (
            <>
              <RootStack.Screen name="Splash" component={SplashScreen} />
              <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
              <RootStack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
              <RootStack.Screen name="OTPVerification" component={OTPVerificationScreen} />
              <RootStack.Screen name="GettingStarted" component={GettingStartedScreen} />
              <RootStack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
            </>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 24, opacity: color === Colors.primary ? 1 : 0.5 }}>{icon}</Text>;
}
