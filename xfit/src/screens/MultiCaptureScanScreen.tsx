/**
 * Multi-Angle Scan Screen
 * 
 * Production-ready body scanning with:
 * - Multi-angle capture (front + side + back)
 * - Visual pose guide overlay
 * - Real-time image validation
 * - Progress tracking
 * - Accuracy reporting
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Theme } from '../constants/theme';
import { CaptureGuide } from '../components/CaptureGuide';
import EnterpriseProgressStepper, { EnterpriseStep } from '../components/EnterpriseProgressStepper';
import { LivePoseFeedback, analyzePose } from '../components/LivePoseFeedback';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { poseProcessor, PoseProcessingResult } from '../services/poseProcessor';
import { measurementEngine, CaptureAngle, ContourData } from '../services/measurementEngine';
import { contourService } from '../services/contourService';
import { productionImageValidation } from '../services/productionImageValidation';
import { accuracyEngine } from '../services/accuracyEngine';
import { useMeasurementStore } from '../stores/measurementStore';
import { useEnterpriseStore } from '../stores/enterpriseStore';
import { useUserStore } from '../stores/userStore';
import { BodyMeasurement } from '../types/measurements';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BURST_TOTAL_FRAMES = 5;
const AUTO_CAPTURE_SAMPLE_MS = 2200;
const AUTO_CAPTURE_STABLE_MS = 1500;
const PRIMARY_CAPTURE_QUALITY = 0.72;
const BURST_CAPTURE_QUALITY = 0.5;
const AUTO_SAMPLE_QUALITY = 0.25;

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
  const [currentStep, setCurrentStep] = useState<CaptureStep>(
    (route?.params?.initialStep as CaptureStep) || 'front'
  );
  const [captures, setCaptures] = useState<CapturedAngle[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [liveLandmarks, setLiveLandmarks] = useState<import('../services/measurementEngine').Landmark[] | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState('Auto capture checking pose');
  const [autoReadySince, setAutoReadySince] = useState<number | null>(null);
  const cameraRef = useRef<any>(null);
  const autoSamplingRef = useRef(false);

  const addMeasurement = useMeasurementStore((state) => state.addMeasurement);
  const activeEnterpriseSessionId = useEnterpriseStore((state) => state.activeSessionId);
  const activeInviteCode = useEnterpriseStore((state) => state.activeInviteCode);
  const activeOrganizationId = useEnterpriseStore((state) => state.organizationId);
  const activeOrganizationName = useEnterpriseStore((state) => state.organizationName);
  const organizationPrimaryColor = useEnterpriseStore((state) => state.organizationPrimaryColor);
  const activeEnterpriseCustomerName = useEnterpriseStore((state) => state.activeCustomerName);
  const activeEnterpriseCustomerEmail = useEnterpriseStore((state) => state.activeCustomerEmail);
  const activeOccasion = useEnterpriseStore((state) => state.activeOccasion);
  const activePreferredFit = useEnterpriseStore((state) => state.activePreferredFit);
  const activeStyleNotes = useEnterpriseStore((state) => state.activeStyleNotes);
  const user = useUserStore((state) => state.user);

  // Calibration passed from CalibrationScreen or route params
  const calibration = route?.params?.calibration || null;
  const knownHeight = route?.params?.knownHeight || user?.heightCm || null;
  const anchorMeasurement: { key: string; valueCm: number } | null =
    route?.params?.anchorMeasurement || null;

  const CAPTURE_STEPS: Array<'front' | 'side' | 'back'> = ['front', 'side', 'back'];
  const currentStepIndex = CAPTURE_STEPS.indexOf(currentStep as any);
  const hasAcceptedSideCapture = captures.some(c => c.type === 'side');
  const hasAcceptedBackCapture = captures.some(c => c.type === 'back');
  const isEnterpriseScan = Boolean(activeEnterpriseSessionId);
  const enterpriseActiveStep: EnterpriseStep =
    currentStep === 'front' ? 'front' : currentStep === 'side' ? 'side' : currentStep === 'back' ? 'back' : 'review';
  const enterpriseCompletedSteps: EnterpriseStep[] = [
    'profile',
    ...(captures.some(c => c.type === 'front') ? ['front' as EnterpriseStep] : []),
    ...(captures.some(c => c.type === 'side') ? ['side' as EnterpriseStep] : []),
    ...(captures.some(c => c.type === 'back') ? ['back' as EnterpriseStep] : []),
  ];

  // ============================================================
  // CAPTURE HANDLER
  // ============================================================

  const capturePhotoToCache = useCallback(async (
    options: { quality: number; base64: boolean; skipProcessing: boolean },
    prefix: string
  ): Promise<string | null> => {
    if (!cameraRef.current) return null;

    const photo = await cameraRef.current.takePictureAsync(options);
    if (!photo || (!photo.uri && !photo.base64)) {
      return null;
    }

    if (photo.base64) {
      const cacheUri = `${FileSystem.cacheDirectory}${prefix}_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(cacheUri, photo.base64, {
        encoding: 'base64',
      });
      return cacheUri;
    }

    return photo.uri;
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);

      // 1. Take photo (with base64 so we can write to a guaranteed-accessible path)
      const imageUri = await capturePhotoToCache({
        quality: PRIMARY_CAPTURE_QUALITY,
        base64: true,
        skipProcessing: false,
      }, 'capture');

      if (!imageUri) {
        setIsCapturing(false);
        Alert.alert(
          'Capture Failed',
          'Camera did not return an image. Please try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      // 2. Validate image
      const validation = await productionImageValidation.validate(imageUri);
      
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

      // Capture additional rapid frames for burst averaging and best-frame selection.
      const burstUris: string[] = [imageUri];
      for (let i = 0; i < BURST_TOTAL_FRAMES - 1; i++) {
        try {
          const burstUri = await capturePhotoToCache({
            quality: BURST_CAPTURE_QUALITY,
            base64: true,
            skipProcessing: true, // faster for burst frames
          }, `burst_${i}`);
          if (burstUri) burstUris.push(burstUri);
        } catch {
          // If burst capture fails, continue with what we have
          break;
        }
      }

      // Use burst processing if multiple frames, else single
      const poseResult = burstUris.length > 1
        ? await poseProcessor.processBurst(burstUris, currentStep as 'front' | 'side' | 'back')
        : await poseProcessor.processImage(imageUri, currentStep as 'front' | 'side' | 'back');

      if (poseResult.processingMode === 'fallback') {
        setIsCapturing(false);
        setLiveLandmarks(null);
        Alert.alert(
          'Pose Engine Unavailable',
          'Tailor-X could not reach cloud pose detection, and on-device pose detection is not installed in this app build. No scan was saved. Check your internet connection and retry.',
          [{ text: 'Retry' }]
        );
        return;
      }

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

      // Hard gate: do not accept captures that fail full-body, centering,
      // distance, posture, or angle checks.
      if (!poseFeedback.overallReady && poseResult.confidence >= 0.3) {
        setIsCapturing(false);
        Alert.alert(
          'Capture Gate Failed',
          poseFeedback.issues.join('\n') + '\n\nPlease adjust and retake.',
          [{ text: 'Retake', style: 'cancel' }]
        );
        return;
      }

      const newCapture: CapturedAngle = {
        type: currentStep as 'front' | 'side' | 'back',
        imageUri,
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
        const isBackNext = nextStep === 'back';
        const isRequiredNext = isSideNext || isBackNext;

        // Encourage side-view capture because it gives circumference estimates more evidence.
        Alert.alert(
          `${capitalize(currentStep)} View Captured! ✅`,
          `Confidence: ${Math.round(poseResult.confidence * 100)}%\n` +
          `${poseResult.landmarks.length} landmarks detected\n\n` +
          `Next: ${capitalize(nextStep)} view` +
          (isSideNext
            ? '\n\nAdding a side view gives the engine depth evidence for chest, waist, and hips.'
            : isBackNext
              ? '\n\nAdding a back view improves shoulder balance, back width, and posture checks.'
            : ''),
          [
            {
              text: `Capture ${capitalize(nextStep)}`,
            },
            ...(isRequiredNext
              ? [] // Don't offer "Finish Now" before side view — strongly encourage it
              : [{
                  text: 'Finish Now',
                  onPress: () => reviewCapturesBeforeProcessing(updatedCaptures),
                }]
            ),
          ]
        );
      } else {
        // All captures done, show a final review before processing
        await reviewCapturesBeforeProcessing(updatedCaptures);
      }
    } catch (error) {
      setIsCapturing(false);
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture. Please try again.');
    }
  }, [currentStep, captures, isCapturing, currentStepIndex, capturePhotoToCache]);

  // ============================================================
  // MEASUREMENT PROCESSING
  // ============================================================

  const processMeasurements = async (allCaptures: CapturedAngle[]) => {
    if (!allCaptures.some(c => c.type === 'side')) {
      setCurrentStep('side');
      setIsCapturing(false);
      setIsProcessing(false);
      Alert.alert(
        'Side View Required',
        'Capture a side view before finishing. Chest, waist, hips, thigh, and calf need side-view depth evidence.',
        [{ text: 'Capture Side View' }]
      );
      return;
    }

    if (!allCaptures.some(c => c.type === 'back')) {
      setCurrentStep('back');
      setIsCapturing(false);
      setIsProcessing(false);
      Alert.alert(
        'Back View Required',
        'Capture a back view before finishing. Back view improves shoulder balance, back width, posture, and garment fit checks.',
        [{ text: 'Capture Back View' }]
      );
      return;
    }

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

      // Compute a preliminary scale factor for the contour service.
      // Use landmark-based person height (head-to-feet) instead of full image
      // height — the person only occupies a fraction of the frame.
      let prelimScaleFactor: number | null = null;
      if (knownHeight && frontCapture) {
        const lms = frontCapture.poseResult.landmarks;
        const imgH = frontCapture.poseResult.imageHeight;
        const nose = lms.find(l => l.name === 'nose');
        const lShoulder = lms.find(l => l.name === 'left_shoulder');
        const ankles = lms.filter(l =>
          l.name === 'left_heel' || l.name === 'right_heel' ||
          l.name === 'left_foot_index' || l.name === 'right_foot_index' ||
          l.name === 'left_ankle' || l.name === 'right_ankle'
        );
        const topY = nose && lShoulder
          ? (nose.y - Math.abs(lShoulder.y - nose.y) * 0.6) * imgH
          : 0;
        const bottomY = ankles.length > 0
          ? Math.max(...ankles.map(a => a.y)) * imgH
          : imgH;
        const personHeightPx = Math.max(bottomY - topY, imgH * 0.3);
        prelimScaleFactor = knownHeight / personHeightPx;
      }

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
                  partConfidence: result.partConfidence,
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
                  partConfidence: result.partConfidence,
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
        userGender,
        contourData,
        anchorMeasurement
      );

      // Analyze scan confidence
      setProcessingProgress(70);
      setProcessingMessage('Analyzing scan confidence...');

      const measurements = useMeasurementStore.getState().measurements;
      const accuracyReport = accuracyEngine.analyzeAccuracy(result, measurements);

      // Apply temporal smoothing against scan history
      const { smoothed } = accuracyEngine.applyTemporalSmoothing(
        result.measurements,
        measurements
      );

      // Debug: log pre- and post-smoothing values to diagnose blank measurement display
      if (__DEV__) {
        console.log('[ProcessMeasurements] PRE-smooth:', JSON.stringify(result.measurements));
        console.log('[ProcessMeasurements] POST-smooth:', JSON.stringify(smoothed));
        console.log('[ProcessMeasurements] overallAccuracy:', result.overallAccuracy);
      }

      result.measurements = smoothed;

      // Save measurement
      setProcessingProgress(90);
      setProcessingMessage(activeEnterpriseSessionId ? 'Preparing client review...' : 'Saving results...');

      // Safe accessor: returns 0 for NaN, undefined, negative, or non-finite values
      const safe = (v: number | undefined): number =>
        (typeof v === 'number' && isFinite(v) && v > 0) ? Math.round(v * 10) / 10 : 0;

      const scanSource = activeEnterpriseSessionId ? 'enterprise' : 'free';
      const newMeasurement: BodyMeasurement = {
        id: Date.now().toString(),
        userId: user?.id || 'guest',
        date: new Date(),
        measurements: {
          height: safe(result.measurements.height) || safe(knownHeight) || 170,
          weight: safe(user?.weightKg),
          chest: safe(result.measurements.chest),
          waist: safe(result.measurements.waist),
          hips: safe(result.measurements.hips),
          shoulders: safe(result.measurements.shoulders),
          neck: safe(result.measurements.neck),
          sleeve: safe(result.measurements.sleeve),
          inseam: safe(result.measurements.inseam),
          thigh: safe(result.measurements.thigh),
          calf: safe(result.measurements.calf),
          // Gender-specific and additional measurements
          ...(result.measurements.bust && { bust: safe(result.measurements.bust) }),
          ...(result.measurements.underbust && { underbust: safe(result.measurements.underbust) }),
          ...(result.measurements.cupDifference && { cupDifference: safe(result.measurements.cupDifference) }),
          ...(result.measurements.halfLength && { halfLength: safe(result.measurements.halfLength) }),
          ...(result.measurements.topLength && { topLength: safe(result.measurements.topLength) }),
          ...(result.measurements.frontWidth && { frontWidth: safe(result.measurements.frontWidth) }),
          ...(result.measurements.backWidth && { backWidth: safe(result.measurements.backWidth) }),
          ...(result.measurements.armLength && { armLength: safe(result.measurements.armLength) }),
          ...(result.measurements.outseam && { outseam: safe(result.measurements.outseam) }),
          ...(result.measurements.rise && { rise: safe(result.measurements.rise) }),
          ...(result.measurements.knee && { knee: safe(result.measurements.knee) }),
          ...(result.measurements.ankle && { ankle: safe(result.measurements.ankle) }),
          ...(result.measurements.wrist && { wrist: safe(result.measurements.wrist) }),
          ...(result.measurements.roundSleeveBicep && { roundSleeveBicep: safe(result.measurements.roundSleeveBicep) }),
          ...(result.measurements.roundSleeveElbow && { roundSleeveElbow: safe(result.measurements.roundSleeveElbow) }),
        },
        unit: user?.preferredUnit || 'cm',
        source: scanSource,
        enterprise: activeEnterpriseSessionId ? {
          sessionId: activeEnterpriseSessionId,
          inviteCode: activeInviteCode,
          organizationId: activeOrganizationId,
          organizationName: activeOrganizationName,
          customerName: activeEnterpriseCustomerName,
          customerEmail: activeEnterpriseCustomerEmail,
          occasion: activeOccasion,
          preferredFit: activePreferredFit,
          styleNotes: activeStyleNotes,
          submissionStatus: 'draft',
        } : undefined,
        images: allCaptures.map(c => c.imageUri),
        accuracy: {
          overallScore: result.overallAccuracy,
          confidence: result.confidence,
          anglesUsed: result.metadata.anglesUsed,
          calibrationMethod: result.metadata.calibrationMethod,
          circumferenceSource: result.metadata.circumferenceSource,
          missingRequiredAngles: result.metadata.missingRequiredAngles,
          calibrationConfidence: result.metadata.calibrationConfidence,
          contourConfidenceByPart: result.metadata.contourConfidenceByPart,
          anchorMeasurement: result.metadata.anchorMeasurement,
          measurementCatalogVersion: result.metadata.measurementCatalogVersion,
          measurementProfile: result.metadata.measurementProfile,
          engineVersion: result.metadata.engineVersion,
          processingTimeMs: result.metadata.processingTimeMs,
          warnings: result.warnings,
        },
      };

      await addMeasurement(newMeasurement);

      if (__DEV__) {
        console.log('[ProcessMeasurements] Saved measurement values:', JSON.stringify(newMeasurement.measurements));
      }

      setProcessingProgress(100);
      setIsProcessing(false);

      // Navigate to results screen
      navigation.navigate('ScanResults', {
        result,
        accuracyReport,
        measurementId: newMeasurement.id,
        source: scanSource,
        enterpriseSubmissionStatus: activeEnterpriseSessionId ? 'draft' : undefined,
        organizationName: activeOrganizationName,
      });
      resetScan();
    } catch (error: any) {
      setIsProcessing(false);
      console.error('Processing error:', error?.message || error, error?.stack);
      Alert.alert(
        'Processing Error',
        `Failed to calculate measurements: ${error?.message || 'Unknown error'}.\n\nPlease try again with better conditions.`,
        [{ text: 'OK', onPress: resetScan }]
      );
    }
  };

  function reviewCapturesBeforeProcessing(allCaptures: CapturedAngle[]): Promise<void> {
    const lowestConfidence = [...allCaptures].sort(
      (a, b) => a.poseResult.confidence - b.poseResult.confidence
    )[0];
    const lowConfidenceCaptures = allCaptures.filter(c => c.poseResult.confidence < 0.65);
    const missingSide = !allCaptures.some(c => c.type === 'side');
    const missingBack = !allCaptures.some(c => c.type === 'back');
    const summary = allCaptures
      .map(c => `${capitalize(c.type)}: ${Math.round(c.poseResult.confidence * 100)}%`)
      .join('\n');
    const reviewNotes = [
      missingSide ? 'Side view is required before measuring circumferences.' : null,
      missingBack ? 'Back view is required for shoulder balance, back width, and posture checks.' : null,
      lowConfidenceCaptures.length > 0
        ? `Retake recommended: ${lowConfidenceCaptures.map(c => capitalize(c.type)).join(', ')}.`
        : 'All required capture angles passed the current gates.',
      anchorMeasurement
        ? `Anchor active: ${anchorMeasurement.key} ${anchorMeasurement.valueCm}cm.`
        : null,
    ].filter(Boolean).join('\n');

    return new Promise((resolve) => {
      Alert.alert(
        'Review Captures',
        `${summary}\n\n${reviewNotes}`,
        [
          ...(missingSide
            ? [{
                text: 'Capture Side',
                style: 'cancel' as const,
                onPress: () => {
                  setCurrentStep('side');
                  resolve();
                },
              }]
            : []),
          ...(!missingSide && missingBack
            ? [{
                text: 'Capture Back',
                style: 'cancel' as const,
                onPress: () => {
                  setCurrentStep('back');
                  resolve();
                },
              }]
            : []),
          ...(lowestConfidence && lowConfidenceCaptures.length > 0
            ? [{
                text: `Retake ${capitalize(lowestConfidence.type)}`,
                style: 'cancel' as const,
                onPress: () => {
                  setCaptures(allCaptures.filter(c => c.type !== lowestConfidence.type));
                  setCurrentStep(lowestConfidence.type);
                  setLiveLandmarks(null);
                  setIsCapturing(false);
                  resolve();
                },
              }]
            : []),
          {
            text: 'Process Scan',
            onPress: () => {
              processMeasurements(allCaptures);
              resolve();
            },
          },
        ]
      );
    });
  }

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

    // Side view is required before circumference measurements can be produced.
    if (!hasAcceptedSideCapture) {
      Alert.alert(
        'Side View Required',
        'Capture a side view before finishing. Front view gives width; side view gives depth for circumferences.',
        [{ text: 'Capture Side View', style: 'cancel' }]
      );
      setCurrentStep('side');
      return;
    }

    if (!hasAcceptedBackCapture) {
      Alert.alert(
        'Back View Required',
        'Capture a back view before finishing. Back view improves shoulder balance, back width, posture, and garment fit checks.',
        [{ text: 'Capture Back View', style: 'cancel' }]
      );
      setCurrentStep('back');
      return;
    }

    processMeasurements(captures);
  };

  const samplePoseForAutoCapture = useCallback(async () => {
    const isCaptureStep = currentStep === 'front' || currentStep === 'side' || currentStep === 'back';
    if (!autoCaptureEnabled || !isCaptureStep || isCapturing || isProcessing || !cameraRef.current || autoSamplingRef.current) {
      return;
    }

    autoSamplingRef.current = true;
    let previewUri: string | null = null;

    try {
      setAutoCaptureStatus('Checking pose');
      previewUri = await capturePhotoToCache({
        quality: AUTO_SAMPLE_QUALITY,
        base64: true,
        skipProcessing: true,
      }, 'auto_preview');

      if (!previewUri) {
        setAutoCaptureStatus('Camera warming up');
        setAutoReadySince(null);
        return;
      }

      const poseResult = await poseProcessor.processImage(
        previewUri,
        currentStep as 'front' | 'side' | 'back'
      );

      if (poseResult.processingMode === 'fallback') {
        setLiveLandmarks(null);
        setAutoReadySince(null);
        setAutoCaptureStatus('Pose engine offline');
        return;
      }

      if (poseResult.confidence < 0.3) {
        setLiveLandmarks(null);
        setAutoReadySince(null);
        setAutoCaptureStatus('Find full body');
        return;
      }

      setLiveLandmarks(poseResult.landmarks);
      const feedback = analyzePose(
        poseResult.landmarks,
        poseResult.imageWidth,
        poseResult.imageHeight,
        currentStep as 'front' | 'side' | 'back'
      );

      if (!feedback.overallReady) {
        setAutoReadySince(null);
        setAutoCaptureStatus(feedback.issues[0] || 'Adjust pose');
        return;
      }

      const now = Date.now();
      const readySince = autoReadySince ?? now;
      if (!autoReadySince) {
        setAutoReadySince(now);
      }

      const remainingMs = AUTO_CAPTURE_STABLE_MS - (now - readySince);
      if (remainingMs <= 0) {
        setAutoReadySince(null);
        setAutoCaptureStatus('Capturing');
        await handleCapture();
      } else {
        setAutoCaptureStatus(`Hold still ${Math.ceil(remainingMs / 1000)}s`);
      }
    } catch {
      setAutoReadySince(null);
      setAutoCaptureStatus('Tap to capture');
    } finally {
      autoSamplingRef.current = false;
      if (previewUri?.includes('auto_preview')) {
        try {
          await FileSystem.deleteAsync(previewUri, { idempotent: true });
        } catch {
          // Preview sample cleanup is best-effort.
        }
      }
    }
  }, [
    autoCaptureEnabled,
    autoReadySince,
    capturePhotoToCache,
    currentStep,
    handleCapture,
    isCapturing,
    isProcessing,
  ]);

  useEffect(() => {
    const isCaptureStep = currentStep === 'front' || currentStep === 'side' || currentStep === 'back';
    if (!permission?.granted || !autoCaptureEnabled || !isCaptureStep || isCapturing || isProcessing) {
      setAutoReadySince(null);
      return;
    }

    const intervalId = setInterval(() => {
      samplePoseForAutoCapture();
    }, AUTO_CAPTURE_SAMPLE_MS);

    return () => clearInterval(intervalId);
  }, [
    autoCaptureEnabled,
    currentStep,
    isCapturing,
    isProcessing,
    permission?.granted,
    samplePoseForAutoCapture,
  ]);

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
          Tailor-X needs camera access to scan your body for measurement estimates.
          Depending on your settings, photos may be processed locally or by Tailor-X cloud services.
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
      <CameraView style={styles.camera} facing="back" ref={cameraRef} />

      {/* Overlays rendered outside CameraView with absolute positioning */}
      {currentStep !== 'processing' && currentStep !== 'complete' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
        </View>
      )}

      {/* Top bar — close button + step indicator */}
      {isEnterpriseScan && (
        <View style={[styles.enterpriseCaptureBanner, organizationPrimaryColor ? { borderColor: organizationPrimaryColor } : null]}>
          <Text style={styles.enterpriseCaptureLabel}>Licensed scan</Text>
          <Text style={styles.enterpriseCaptureTitle} numberOfLines={1}>
            {activeOrganizationName || 'Fashion house'}
          </Text>
          <Text style={styles.enterpriseCaptureMeta} numberOfLines={1}>
            {activeEnterpriseCustomerName || 'Client'} - session {activeEnterpriseSessionId?.slice(-6)}
          </Text>
          <EnterpriseProgressStepper
            activeStep={enterpriseActiveStep}
            completedSteps={enterpriseCompletedSteps}
            compact
            tintColor={organizationPrimaryColor}
          />
        </View>
      )}

      <View style={[styles.topBar, { position: 'absolute', top: 0, left: 0, right: 0 }]}>
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

      <TouchableOpacity
        style={[
          styles.autoCapturePill,
          isEnterpriseScan && styles.autoCapturePillEnterprise,
          !autoCaptureEnabled && styles.autoCapturePillOff,
        ]}
        onPress={() => {
          setAutoCaptureEnabled(v => !v);
          setAutoReadySince(null);
          setAutoCaptureStatus(autoCaptureEnabled ? 'Tap to capture' : 'Checking pose');
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.autoCaptureLabel}>
          {autoCaptureEnabled ? 'Auto on' : 'Auto off'}
        </Text>
        <Text style={styles.autoCaptureStatus} numberOfLines={1}>
          {autoCaptureEnabled ? autoCaptureStatus : 'Manual'}
        </Text>
      </TouchableOpacity>

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
          {/* Skip/Finish button */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={skipStep}
            disabled={captures.length === 0 || !hasAcceptedSideCapture || !hasAcceptedBackCapture}
          >
            <Text style={[
              styles.skipText,
              (captures.length === 0 || !hasAcceptedSideCapture || !hasAcceptedBackCapture) && styles.skipTextDisabled,
              (captures.length > 0 && (!hasAcceptedSideCapture || !hasAcceptedBackCapture)) && styles.skipTextHidden,
            ]}>
              {captures.length > 0 ? 'Finish ▶' : ''}
            </Text>
            {captures.length > 0 && (!hasAcceptedSideCapture || !hasAcceptedBackCapture) && (
              <Text style={styles.sideRequiredText}>
                {!hasAcceptedSideCapture ? 'Side required' : 'Back required'}
              </Text>
            )}
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
  enterpriseCaptureBanner: {
    position: 'absolute',
    top: 108,
    left: 16,
    right: 16,
    zIndex: 11,
    backgroundColor: 'rgba(11, 25, 41, 0.86)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  enterpriseCaptureLabel: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: Theme.fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  enterpriseCaptureTitle: {
    color: Theme.colors.white,
    fontSize: 15,
    fontWeight: Theme.fontWeight.bold,
  },
  enterpriseCaptureMeta: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 6,
  },

  // ---- Auto capture ----
  autoCapturePill: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    zIndex: 10,
    minWidth: 150,
    maxWidth: SCREEN_WIDTH - 32,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.colors.primary,
    alignItems: 'center',
  },
  autoCapturePillEnterprise: {
    top: 218,
  },
  autoCapturePillOff: {
    borderColor: 'rgba(255, 255, 255, 0.25)',
    opacity: 0.82,
  },
  autoCaptureLabel: {
    color: Theme.colors.white,
    fontSize: 12,
    fontWeight: Theme.fontWeight.bold,
  },
  autoCaptureStatus: {
    color: Theme.colors.white,
    fontSize: 11,
    opacity: 0.82,
    marginTop: 1,
    maxWidth: SCREEN_WIDTH - 64,
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
  skipTextHidden: {
    opacity: 0,
  },
  sideRequiredText: {
    color: Theme.colors.white,
    fontSize: 11,
    fontWeight: Theme.fontWeight.semibold,
    textAlign: 'center',
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
