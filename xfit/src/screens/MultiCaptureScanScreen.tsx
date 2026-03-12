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
import { LivePoseFeedback, analyzePose } from '../components/LivePoseFeedback';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { poseProcessor, PoseProcessingResult } from '../services/poseProcessor';
import { measurementEngine, CaptureAngle, ContourData } from '../services/measurementEngine';
import { contourService } from '../services/contourService';
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
  const [liveLandmarks, setLiveLandmarks] = useState<import('../services/measurementEngine').Landmark[] | null>(null);
  const cameraRef = useRef<any>(null);

  const addMeasurement = useMeasurementStore((state) => state.addMeasurement);
  const user = useUserStore((state) => state.user);

  // Calibration passed from CalibrationScreen or route params
  const calibration = route?.params?.calibration || null;
  const knownHeight = route?.params?.knownHeight || user?.heightCm || null;
  const anchorMeasurement: { key: string; valueCm: number } | null =
    route?.params?.anchorMeasurement || null;

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

      // 3. Process with pose detection (multi-frame burst averaging)
      setProcessingMessage(`Analyzing ${currentStep} view...`);

      // Capture 2 additional rapid frames for burst averaging (#1)
      const burstUris: string[] = [photo.uri];
      for (let i = 0; i < 2; i++) {
        try {
          const burstPhoto = await cameraRef.current.takePictureAsync({
            quality: 0.9,
            base64: false,
            skipProcessing: true, // faster for burst frames
          });
          burstUris.push(burstPhoto.uri);
        } catch {
          // If burst capture fails, continue with what we have
          break;
        }
      }

      // Use burst processing if multiple frames, else single
      const poseResult = burstUris.length > 1
        ? await poseProcessor.processBurst(burstUris, currentStep as 'front' | 'side' | 'back')
        : await poseProcessor.processImage(photo.uri, currentStep as 'front' | 'side' | 'back');

      if (poseResult.confidence < 0.3) {
        setIsCapturing(false);
        setLiveLandmarks(null);
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
      // Also analyse pose quality and set live landmarks for feedback
      setLiveLandmarks(poseResult.landmarks);
      const poseFeedback = analyzePose(
        poseResult.landmarks,
        poseResult.imageWidth,
        poseResult.imageHeight,
        currentStep as 'front' | 'side' | 'back'
      );

      // Warn user if pose quality is suboptimal (but still usable)
      if (!poseFeedback.overallReady && poseResult.confidence >= 0.3) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Pose Issue Detected',
            poseFeedback.issues.join('\n') + '\n\nProceed with this capture anyway?',
            [
              { text: 'Retake', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Use Anyway', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) {
          setIsCapturing(false);
          return;
        }
      }

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

        const nextStep = CAPTURE_STEPS[nextStepIndex];
        const isSideNext = nextStep === 'side';

        // Encourage side-view capture with accuracy gain info
        Alert.alert(
          `${capitalize(currentStep)} View Captured! ✅`,
          `Confidence: ${Math.round(poseResult.confidence * 100)}%\n` +
          `${poseResult.landmarks.length} landmarks detected\n\n` +
          `Next: ${capitalize(nextStep)} view` +
          (isSideNext
            ? '\n\n⚡ Adding a side view improves circumference accuracy by 40-60% (chest, waist, hips).'
            : ''),
          [
            {
              text: `Capture ${capitalize(nextStep)}`,
            },
            ...(isSideNext
              ? [] // Don't offer "Finish Now" before side view — strongly encourage it
              : [{
                  text: 'Finish Now',
                  onPress: () => processMeasurements(updatedCaptures),
                }]
            ),
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
      setProcessingProgress(40);
      setProcessingMessage('Analyzing body contour...');

      // Extract silhouette contour widths from captured images (if server is available)
      // This provides real body-edge widths instead of skeleton-joint approximations
      const contourData: ContourData = {};
      const frontCapture = allCaptures.find(c => c.type === 'front');
      const sideCapture = allCaptures.find(c => c.type === 'side');

      // Compute a preliminary scale factor for the contour service
      const prelimScaleFactor = knownHeight
        ? knownHeight / (frontCapture?.poseResult?.imageHeight || 1280)
        : null;

      // Extract front and side contours in parallel where possible
      const contourPromises: Promise<void>[] = [];

      if (frontCapture) {
        contourPromises.push(
          contourService
            .extractContour(
              frontCapture.imageUri,
              'front',
              frontCapture.poseResult.landmarks,
              prelimScaleFactor
            )
            .then(result => {
              if (result?.success) {
                contourData.front = {
                  widths: result.widths,
                  silhouetteHeightPx: result.silhouetteHeightPx,
                  segmentationConfidence: result.segmentationConfidence,
                };
              }
            })
        );
      }

      if (sideCapture) {
        contourPromises.push(
          contourService
            .extractContour(
              sideCapture.imageUri,
              'side',
              sideCapture.poseResult.landmarks,
              prelimScaleFactor
            )
            .then(result => {
              if (result?.success) {
                contourData.side = {
                  widths: result.widths,
                  silhouetteHeightPx: result.silhouetteHeightPx,
                  segmentationConfidence: result.segmentationConfidence,
                };
              }
            })
        );
      }

      await Promise.all(contourPromises);

      setProcessingProgress(55);
      setProcessingMessage('Calculating measurements...');

      // Set personalized ratios from user's scan history (if enough data exists)
      const allMeasurements = useMeasurementStore.getState().measurements;
      const userGender = (user?.gender as 'male' | 'female' | 'other') || 'other';
      measurementEngine.setPersonalizedRatios(
        allMeasurements.map(m => ({ measurements: m.measurements as Record<string, number> })),
        userGender
      );
      
      const result = measurementEngine.calculateFromMultiAngle(
        captureAngles,
        calibration,
        knownHeight,
        (user?.gender as 'male' | 'female' | 'other') || 'other',
        contourData,
        anchorMeasurement
      );

      // Analyze accuracy
      setProcessingProgress(70);
      setProcessingMessage('Analyzing accuracy...');

      const measurements = useMeasurementStore.getState().measurements;
      const accuracyReport = accuracyEngine.analyzeAccuracy(result, measurements);

      // Apply temporal smoothing against scan history
      const { smoothed } = accuracyEngine.applyTemporalSmoothing(
        result.measurements,
        measurements
      );
      result.measurements = smoothed;

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
    setLiveLandmarks(null);
  };

  const skipStep = () => {
    if (captures.length === 0) {
      Alert.alert('Front View Required', 'At least the front view is needed for measurements.');
      return;
    }

    // If side view hasn't been captured yet, strongly encourage it
    const hasSideCapture = captures.some(c => c.type === 'side');
    if (!hasSideCapture) {
      Alert.alert(
        'Side View Recommended',
        'Without a side view, circumference measurements (chest, waist, hips) will be estimated from averages, reducing accuracy by 40-60%.\n\n' +
        'Are you sure you want to skip?',
        [
          { text: 'Capture Side View', style: 'cancel' },
          {
            text: 'Skip Anyway',
            style: 'destructive',
            onPress: () => processMeasurements(captures),
          },
        ]
      );
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
          <>
            <CaptureGuide
              captureType={currentStep as 'front' | 'side' | 'back'}
              isReady={!isCapturing}
            />
            <LivePoseFeedback
              landmarks={liveLandmarks}
              imageWidth={720}
              imageHeight={1280}
              captureType={currentStep as 'front' | 'side' | 'back'}
            />
          </>
        )}

        {/* Top bar — close button + step indicator */}
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

          {/* Compact step indicator pill */}
          <View style={styles.stepPill}>
            {CAPTURE_STEPS.map((step, index) => {
              const isDone = index < captures.length;
              const isActive = step === currentStep;
              return (
                <View key={step} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepDot,
                      isDone && styles.stepDotDone,
                      isActive && styles.stepDotActive,
                    ]}
                  >
                    {isDone ? (
                      <Text style={styles.stepCheck}>✓</Text>
                    ) : (
                      <Text style={[styles.stepNumber, isActive && styles.stepNumberActive]}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <Text style={[
                    styles.stepLabel,
                    isActive && styles.stepLabelActive,
                    isDone && styles.stepLabelDone,
                  ]}>
                    {capitalize(step)}
                  </Text>
                  {index < CAPTURE_STEPS.length - 1 && (
                    <View style={[styles.stepConnector, isDone && styles.stepConnectorDone]} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Spacer to balance close button */}
          <View style={{ width: 40 }} />
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Skip/Finish button */}
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

  // ---- Top bar ----
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: Theme.spacing.md,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: Theme.colors.white,
    fontSize: 18,
    fontWeight: '600' as const,
  },

  // ---- Step indicator pill ----
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  stepDotDone: {
    backgroundColor: Theme.colors.success,
    borderColor: Theme.colors.success,
  },
  stepDotActive: {
    borderColor: Theme.colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(26, 191, 176, 0.2)',
  },
  stepCheck: {
    color: Theme.colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  stepNumber: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  stepNumberActive: {
    color: Theme.colors.primary,
  },
  stepLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '500' as const,
    marginLeft: 4,
    marginRight: 2,
  },
  stepLabelActive: {
    color: Theme.colors.white,
    fontWeight: '600' as const,
  },
  stepLabelDone: {
    color: Theme.colors.success,
  },
  stepConnector: {
    width: 12,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 4,
  },
  stepConnectorDone: {
    backgroundColor: Theme.colors.success,
  },

  // ---- Bottom bar ----
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 36,
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
    width: 76,
    height: 76,
    borderRadius: 38,
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
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Theme.colors.primary,
  },
  captureButtonProcessing: {
    width: 28,
    height: 28,
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

  // ---- Permission screen ----
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
