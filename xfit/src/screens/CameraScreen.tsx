import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Theme } from '../constants/theme';
import { useMeasurementStore } from '../stores/measurementStore';
import { useUserStore } from '../stores/userStore';
import { mlService } from '../services/mlService';
import { imageValidationService } from '../services/imageValidation';
import { BodyMeasurement } from '../types/measurements';

export default function CameraScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const cameraRef = useRef<any>(null);
  
  // State management
  const addMeasurement = useMeasurementStore((state) => state.addMeasurement);
  const user = useUserStore((state) => state.user);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera permission is required to scan your body
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);
      
      // Capture photo with maximum quality
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0, // Maximum quality for best ML accuracy
        base64: false,
        skipProcessing: false,
      });

      console.log('Photo captured:', photo.uri);

      // Validate image quality
      const validation = await imageValidationService.validateForMeasurement(photo.uri);
      
      if (!validation.isValid) {
        setIsProcessing(false);
        Alert.alert(
          'Image Quality Issues Detected',
          `Score: ${validation.score}/100\n\n` +
          `Issues:\n${validation.issues.map(i => `• ${i.message}`).join('\n')}\n\n` +
          `Recommendations:\n${validation.recommendations.map(r => `• ${r}`).join('\n')}`,
          [
            { text: 'Try Again', style: 'cancel' },
            { 
              text: 'Continue Anyway', 
              onPress: () => processImageWithML(photo.uri),
              style: 'destructive'
            },
          ]
        );
        return;
      }

      await processImageWithML(photo.uri);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('Error', 'Failed to capture image. Please try again.');
      console.error('Camera capture error:', error);
    }
  };

  const processImageWithML = async (imageUri: string) => {
    try {
      // Get user height for calibration
      const userHeight = user?.measurementHistory?.[0]?.height || 170;

      // Process image with ML service (MediaPipe)
      console.log('Processing with MediaPipe BlazePose...');
      const scanResult = await mlService.processImage({
        imageUri,
        height: userHeight,
        gender: user?.gender,
      });

      console.log('Scan result:', scanResult);

      // Create measurement object
      const newMeasurement: BodyMeasurement = {
        id: Date.now().toString(),
        userId: user?.id || 'guest',
        date: new Date(),
        measurements: {
          ...scanResult.measurements,
          weight: 70, // TODO: Get from user input or scale integration
        },
        unit: user?.preferredUnit || 'cm',
        images: [imageUri],
      };

      // Save measurement
      await addMeasurement(newMeasurement);
      
      setIsProcessing(false);
      
      // Show success with accuracy
      Alert.alert(
        'Scan Complete! 🎉',
        `Measurements captured with ${scanResult.accuracy}% confidence\n\n` +
        `${scanResult.keyPoints.length} body landmarks detected`,
        [
          {
            text: 'View Results',
            onPress: () => navigation.navigate('Measurements'),
          },
          {
            text: 'Scan Again',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      setIsProcessing(false);
      Alert.alert(
        'Processing Failed',
        'Could not extract measurements from image. Please ensure:\n\n' +
        '• Full body is visible\n' +
        '• Good lighting\n' +
        '• Standing 2-3 meters from camera\n' +
        '• Plain background',
        [{ text: 'Try Again' }]
      );
      console.error('ML processing error:', error);
    }
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.iconText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Position Your Body</Text>
            <View style={styles.iconButton} />
          </View>

          <View style={styles.guideline}>
            <View style={styles.guidelineBox} />
            <Text style={styles.instructionText}>
              Stand in the frame with arms slightly apart
            </Text>
          </View>

          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.flipButton}
              onPress={toggleCameraFacing}
            >
              <Text style={styles.flipText}>🔄</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
              onPress={handleCapture}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color={Theme.colors.white} />
              ) : (
                <View style={styles.captureButtonInner} />
              )}
            </TouchableOpacity>

            <View style={styles.flipButton} />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.black,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
    backgroundColor: Theme.colors.background,
  },
  permissionText: {
    fontSize: Theme.fontSize.lg,
    textAlign: 'center',
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xl,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Theme.spacing.xxl,
    paddingHorizontal: Theme.spacing.lg,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    color: Theme.colors.white,
    fontSize: 24,
  },
  title: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
  },
  guideline: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
  },
  guidelineBox: {
    width: 250,
    height: 400,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    borderStyle: 'dashed',
  },
  instructionText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    marginTop: Theme.spacing.lg,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Theme.spacing.xxl,
    paddingHorizontal: Theme.spacing.lg,
  },
  flipButton: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipText: {
    fontSize: 32,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Theme.colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Theme.colors.primary,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.colors.primary,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
  },
});
