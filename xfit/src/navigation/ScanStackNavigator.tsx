/**
 * Scan Stack Navigator
 * 
 * Stack flow: ScanHome → Calibration → MultiCapture → ScanResults
 * 
 * ScanHome is the MultiCaptureScanScreen (camera view).
 * Calibration is presented before scanning if no calibration exists.
 * ScanResults shows the final measurement results.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScanStackParamList } from '../types/navigation';
import { Theme } from '../constants/theme';

import MultiCaptureScanScreen from '../screens/MultiCaptureScanScreen';
import CalibrationScreen from '../screens/CalibrationScreen';
import ScanResultsScreen from '../screens/ScanResultsScreen';

const Stack = createNativeStackNavigator<ScanStackParamList>();

export default function ScanStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: Theme.colors.white,
        },
        headerTintColor: Theme.colors.text.primary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="ScanHome"
        component={MultiCaptureScanScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Calibration"
        component={CalibrationScreen}
        options={{
          title: 'Calibration',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="ScanResults"
        component={ScanResultsScreen}
        options={{
          title: 'Results',
          headerLeft: () => null, // Prevent back to camera during results
        }}
      />
    </Stack.Navigator>
  );
}
