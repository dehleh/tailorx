import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CustomTabBar } from '../components/CustomTabBar';
import { RootStackParamList, RootTabParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';

// Auth screens
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import EmailAuthScreen from '../screens/PhoneAuthScreen';
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
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
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
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanStackNavigator}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Measurements"
        component={MeasurementsScreen}
        options={{ title: 'My Measurements' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
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
              {!isAuthenticated ? (
                <>
                  <RootStack.Screen name="Splash" component={SplashScreen} />
                  <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
                  <RootStack.Screen name="EmailAuth" component={EmailAuthScreen} />
                  <RootStack.Screen name="OTPVerification" component={OTPVerificationScreen} />
                </>
              ) : null}
              <RootStack.Screen name="GettingStarted" component={GettingStartedScreen} />
              <RootStack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
            </>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}


