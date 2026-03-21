/**
 * Scan Stack Navigator
 * 
 * Stack flow: PreparationChecklist → ScanHome → Calibration → MultiCapture → Processing → ScanResults
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScanStackParamList } from '../types/navigation';
import { Colors } from '../constants/colors';

import PreparationChecklistScreen from '../screens/PreparationChecklistScreen';
import MultiCaptureScanScreen from '../screens/MultiCaptureScanScreen';
import CalibrationScreen from '../screens/CalibrationScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import ScanResultsScreen from '../screens/ScanResultsScreen';

const Stack = createNativeStackNavigator<ScanStackParamList>();

export default function ScanStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.white,
        },
        headerTintColor: Colors.text.primary,
        headerTitleStyle: {
          fontWeight: '700' as const,
          fontSize: 18,
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="PreparationChecklist"
        component={PreparationChecklistScreen}
        options={{ title: 'Prepare to Scan' }}
      />
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
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="Processing"
        component={ProcessingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ScanResults"
        component={ScanResultsScreen}
        options={{
          title: 'Results',
          headerLeft: () => null,
        }}
      />
    </Stack.Navigator>
  );
}
