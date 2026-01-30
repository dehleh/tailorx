import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppInitialization } from './src/utils/useAppInitialization';
import { mlService } from './src/services/mlService';
import { Theme } from './src/constants/theme';

export default function App() {
  const [tfReady, setTfReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize app data
  useAppInitialization();

  // Initialize TensorFlow
  useEffect(() => {
    async function initializeTF() {
      try {
        console.log('Initializing TensorFlow.js...');
        await tf.ready();
        console.log('TensorFlow.js initialized');
        
        // Preload ML model in background
        mlService.loadModel().catch(err => {
          console.warn('ML model preload failed:', err);
        });
        
        setTfReady(true);
      } catch (err) {
        console.error('TensorFlow initialization error:', err);
        setError('Failed to initialize ML engine');
        // Still allow app to load
        setTfReady(true);
      }
    }
    
    initializeTF();
  }, []);

  if (!tfReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Initializing ML Engine...</Text>
      </View>
    );
  }

  if (error) {
    console.warn(error);
    // Continue anyway - app will use mock measurements
  }

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Theme.colors.textSecondary,
  },
});
