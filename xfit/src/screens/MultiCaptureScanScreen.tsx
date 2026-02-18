/**
 * Multi-Angle Scan Screen
 * 
 * Production-ready body scanning with:
 * - Multi-angle capture (front + side + optional back)
 * - Visual pose guide overlay
 * - Real-time image validation
 * - Progress tracking
 * - Accuracy reporting
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Theme } from '../constants/theme';
import { CaptureGuide } from '../components/CaptureGuide';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { poseProcessor, PoseProcessingResult } from '../services/poseProcessor';
import { measurementEngine, CaptureAngle } from '../services/measurementEngine';
import { productionImageValidation } from '../services/productionImageValidation';
import { accuracyEngine } from '../services/accuracyEngine';
import { useMeasurementStore } from '../stores/measurementStore';
import { useUserStore } from '../stores/userStore';
import { BodyMeasurement } from '../types/measurements';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================
// TYPES
// ============================================================

type CaptureStep = 'front' | 'side' | 'back' | 'processing' | 'complete';

interface CapturedAngle {
  type: 'front' | 'side' | 'back';
  imageUri: string;
  poseResult: PoseProcessingResult;
}

// ============================================================
// COMPONENT
// ============================================================

export default function MultiCaptureScanScreen({ navigation, route }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [currentStep, setCurrentStep] = useState<CaptureStep>('front');
  const [captures, setCaptures] = useState<CapturedAngle[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const cameraRef = useRef<any>(null);

  const addMeasurement = useMeasurementStore((state) => state.addMeasurement);
  const user = useUserStore((state) => state.user);

  // Calibration passed from CalibrationScreen or route params
  const calibration = route?.params?.calibration || null;
  const knownHeight = route?.params?.knownHeight || user?.heightCm || null;

  const CAPTURE_STEPS: Array<'front' | 'side' | 'back'> = ['front', 'side', 'back'];
  const currentStepIndex = CAPTURE_STEPS.indexOf(currentStep as any);

  // ============================================================
  // CAPTURE HANDLER
  // ============================================================

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);

      // 1. Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
        skipProcessing: false,
      });

      // 2. Validate image
      const validation = await productionImageValidation.validate(photo.uri);
      
      if (!validation.isValid && !validation.canProceedWithWarnings) {
        setIsCapturing(false);
        Alert.alert(
          'Image Quality Issue',
          `Score: ${validation.overallScore}/100\n\n` +
          validation.recommendations.join('\n'),
          [{ text: 'Retake', style: 'cancel' }]
        );
        return;
      }

      if (!validation.isValid && validation.canProceedWithWarnings) {
        // Show warning but allow proceeding
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Image Quality Warning',
            `Score: ${validation.overallScore}/100\n\n` +
            validation.recommendations.join('\n') +
            '\n\nProceed anyway?',
            [
              { text: 'Retake', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) {
          setIsCapturing(false);
          return;
        }
      }

      // 3. Process with pose detection
      setProcessingMessage(`Analyzing ${currentStep} view...`);
      const poseResult = await poseProcessor.processImage(
        photo.uri,
        currentStep as 'front' | 'side' | 'back'
      );

      if (poseResult.confidence < 0.3) {
        setIsCapturing(false);
        Alert.alert(
          'Pose Detection Failed',
          'Could not detect body landmarks. Please ensure:\n\n' +
          '• Full body is visible in frame\n' +
          '• Good lighting (avoid backlighting)\n' +
          '• Plain background\n' +
          '• Standing upright',
          [{ text: 'Try Again' }]
        );
        return;
      }

      // 4. Store capture
      const newCapture: CapturedAngle = {
        type: currentStep as 'front' | 'side' | 'back',
        imageUri: photo.uri,
        poseResult,
      };

      const updatedCaptures = [...captures, newCapture];
      setCaptures(updatedCaptures);

      // 5. Move to next step
      const nextStepIndex = currentStepIndex + 1;
      if (nextStepIndex < CAPTURE_STEPS.length) {
        setCurrentStep(CAPTURE_STEPS[nextStepIndex]);
        setIsCapturing(false);

        // Show intermediate result
        Alert.alert(
          `${capitalize(currentStep)} View Captured! ✅`,
          `Confidence: ${Math.round(poseResult.confidence * 100)}%\n` +
          `${poseResult.landmarks.length} landmarks detected\n\n` +
          `Next: ${capitalize(CAPTURE_STEPS[nextStepIndex])} view`,
          [
            {
              text: `Capture ${capitalize(CAPTURE_STEPS[nextStepIndex])}`,
            },
            {
              text: 'Finish Now',
              onPress: () => processMeasurements(updatedCaptures),
            },
          ]
        );
      } else {
        // All captures done, process
        await processMeasurements(updatedCaptures);
      }
    } catch (error) {
      setIsCapturing(false);
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture. Please try again.');
    }
  }, [currentStep, captures, isCapturing, currentStepIndex]);

  // ============================================================
  // MEASUREMENT PROCESSING
  // ============================================================

  const processMeasurements = async (allCaptures: CapturedAngle[]) => {
    setIsProcessing(true);
    setProcessingProgress(10);
    setProcessingMessage('Combining multi-angle data...');

    try {
      // Convert captures to CaptureAngles for the engine
      setProcessingProgress(30);
      const captureAngles: CaptureAngle[] = allCaptures.map(c =>
        poseProcessor.toCaptureAngle(c.poseResult, c.type)
      );

      // Run measurement engine
      setProcessingProgress(50);
      setProcessingMessage('Calculating measurements...');
      
      const result = measurementEngine.calculateFromMultiAngle(
        captureAngles,
        calibration,
        knownHeight,
        (user?.gender as 'male' | 'female' | 'other') || 'other'
      );

      // Analyze accuracy
      setProcessingProgress(70);
      setProcessingMessage('Analyzing accuracy...');

      const measurements = useMeasurementStore.getState().measurements;
      const accuracyReport = accuracyEngine.analyzeAccuracy(result, measurements);

      // Save measurement
      setProcessingProgress(90);
      setProcessingMessage('Saving results...');

      const newMeasurement: BodyMeasurement = {
        id: Date.now().toString(),
        userId: user?.id || 'guest',
        date: new Date(),
        measurements: {
          height: result.measurements.height || knownHeight || 170,
          weight: user?.weightKg || 0,
          chest: result.measurements.chest || 0,
          waist: result.measurements.waist || 0,
          hips: result.measurements.hips || 0,
          shoulders: result.measurements.shoulders || 0,
          neck: result.measurements.neck || 0,
          sleeve: result.measurements.sleeve || 0,
          inseam: result.measurements.inseam || 0,
          thigh: result.measurements.thigh || 0,
          calf: result.measurements.calf || 0,
        },
        unit: user?.preferredUnit || 'cm',
        images: allCaptures.map(c => c.imageUri),
        accuracy: {
          overallScore: result.overallAccuracy,
          confidence: result.confidence,
          anglesUsed: result.metadata.anglesUsed,
          calibrationMethod: result.metadata.calibrationMethod,
          engineVersion: result.metadata.engineVersion,
          processingTimeMs: result.metadata.processingTimeMs,
          warnings: result.warnings,
        },
      };

      await addMeasurement(newMeasurement);

      setProcessingProgress(100);
      setIsProcessing(false);

      // Navigate to results screen
      navigation.navigate('ScanResults', {
        result,
        accuracyReport,
      });
      resetScan();
    } catch (error) {
      setIsProcessing(false);
      console.error('Processing error:', error);
      Alert.alert(
        'Processing Error',
        'Failed to calculate measurements. Please try again with better conditions.',
        [{ text: 'OK', onPress: resetScan }]
      );
    }
  };

  // ============================================================
  // HELPERS
  // ============================================================

  const resetScan = () => {
    setCaptures([]);
    setCurrentStep('front');
    setIsProcessing(false);
    setIsCapturing(false);
    setProcessingProgress(0);
  };

  const skipStep = () => {
    if (captures.length === 0) {
      Alert.alert('Front View Required', 'At least the front view is needed for measurements.');
      return;
    }
    processMeasurements(captures);
  };

  // ============================================================
  // PERMISSION HANDLING
  // ============================================================

  if (!permission) {
    return (
      <View style={styles.centeredContainer}>
        <LoadingOverlay visible message="Checking camera..." />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionIcon}>📸</Text>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          Tailor-X needs camera access to scan your body for accurate measurements.
          Your photos are processed on-device and never shared.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        {/* Capture guide overlay */}
        {currentStep !== 'processing' && currentStep !== 'complete' && (
          <CaptureGuide
            captureType={currentStep as 'front' | 'side' | 'back'}
            isReady={!isCapturing}
          />
        )}

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              if (captures.length > 0) {
                Alert.alert(
                  'Discard Scan?',
                  'You have captures in progress. Discard and go back?',
                  [
                    { text: 'Continue Scanning', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
                  ]
                );
              } else {
                navigation.goBack();
              }
            }}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          {/* Progress indicators */}
          <View style={styles.progressDots}>
            {CAPTURE_STEPS.map((step, index) => (
              <View key={step} style={styles.progressDotContainer}>
                <View
                  style={[
                    styles.progressDot,
                    index < captures.length && styles.progressDotDone,
                    step === currentStep && styles.progressDotActive,
                  ]}
                >
                  {index < captures.length && (
                    <Text style={styles.progressCheck}>✓</Text>
                  )}
                </View>
                <Text style={styles.progressLabel}>
                  {capitalize(step)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.closeButton} />
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Skip button (only after front view) */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={skipStep}
            disabled={captures.length === 0}
          >
            <Text style={[
              styles.skipText,
              captures.length === 0 && styles.skipTextDisabled,
            ]}>
              {captures.length > 0 ? 'Finish ▶' : ''}
            </Text>
          </TouchableOpacity>

          {/* Capture button */}
          <TouchableOpacity
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <View style={styles.captureButtonProcessing} />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          {/* Captures count */}
          <View style={styles.captureCount}>
            <Text style={styles.captureCountText}>
              {captures.length}/{CAPTURE_STEPS.length}
            </Text>
            <Text style={styles.captureCountLabel}>captured</Text>
          </View>
        </View>
      </CameraView>

      {/* Processing overlay */}
      <LoadingOverlay
        visible={isProcessing}
        message={processingMessage}
        subMessage="This may take a few seconds..."
        progress={processingProgress}
      />
    </View>
  );
}

// ============================================================
// HELPERS
// ============================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.black,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.background,
  },
  camera: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: Theme.spacing.lg,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: Theme.colors.white,
    fontSize: 20,
    fontWeight: '600',
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  progressDotContainer: {
    alignItems: 'center',
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressDotDone: {
    backgroundColor: Theme.colors.success,
    borderColor: Theme.colors.success,
  },
  progressDotActive: {
    borderColor: Theme.colors.primary,
    borderWidth: 3,
  },
  progressCheck: {
    color: Theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  progressLabel: {
    color: Theme.colors.white,
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
    opacity: 0.8,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: Theme.spacing.xl,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  skipButton: {
    width: 70,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.semibold,
  },
  skipTextDisabled: {
    opacity: 0,
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
  captureButtonProcessing: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: Theme.colors.error,
  },
  captureCount: {
    width: 70,
    alignItems: 'center',
  },
  captureCountText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
  },
  captureCountLabel: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.xs,
    opacity: 0.7,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.xl,
    backgroundColor: Theme.colors.background,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: Theme.spacing.lg,
  },
  permissionTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Theme.spacing.xl,
    paddingHorizontal: Theme.spacing.lg,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    ...Theme.shadows.medium,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
  },
});
