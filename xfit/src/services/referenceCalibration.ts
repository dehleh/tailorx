/**
 * Reference Calibration Service
 * 
 * Uses a known-size reference object (credit card, A4 paper, etc.)
 * to establish accurate pixel-to-cm scale.
 * 
 * This is the single biggest accuracy improvement for body measurement.
 * Without calibration: ±3-6cm error
 * With calibration:    ±1-2cm error
 */

import { REFERENCE_SIZES, CalibrationReference } from './measurementEngine';

// ============================================================
// TYPES
// ============================================================

export interface CalibrationResult {
  reference: CalibrationReference;
  pixelsPerCm: number;
  confidence: number;
  distanceEstimateCm: number; // Estimated distance from camera
}

export interface CalibrationGuide {
  referenceType: keyof typeof REFERENCE_SIZES;
  instructions: string[];
  tips: string[];
  badExamples: string[];
}

// ============================================================
// CALIBRATION SERVICE
// ============================================================

class ReferenceCalibrationService {
  /**
   * Create a calibration reference from detected object dimensions
   * 
   * In production, the object detection would be done by:
   * 1. Cloud API: Send image to server for edge/contour detection
   * 2. On-device: Use TensorFlow.js with a custom object detection model
   * 3. Manual: User draws a rectangle around the reference object
   */
  createCalibration(
    referenceType: keyof typeof REFERENCE_SIZES,
    detectedWidthPixels: number,
    detectedHeightPixels: number
  ): CalibrationResult {
    const realSize = REFERENCE_SIZES[referenceType];

    // Calculate pixels-per-cm from both dimensions for validation
    const ppcWidth = detectedWidthPixels / realSize.width;
    const ppcHeight = detectedHeightPixels / realSize.height;

    // Check aspect ratio consistency (should be close)
    const aspectRatioError = Math.abs(ppcWidth - ppcHeight) / Math.max(ppcWidth, ppcHeight);

    let confidence = 0.95;
    if (aspectRatioError > 0.05) {
      confidence -= aspectRatioError * 2; // Reduce confidence if aspect ratio is off
    }

    // Use average of both dimensions
    const pixelsPerCm = (ppcWidth + ppcHeight) / 2;

    // Estimate distance from camera (useful for user guidance)
    // Typical phone camera focal length ~4mm, sensor ~6mm width
    // distance ≈ (realWidth * focalLength) / (objectWidthPixels * sensorWidth / imageWidth)
    // Simplified: assume standard phone camera characteristics
    const focalLengthMm = 4.0;
    const sensorWidthMm = 6.0;
    const imageWidthPixels = 720; // assume standard
    const distanceEstimateCm = (realSize.width * 10 * focalLengthMm * imageWidthPixels) /
      (detectedWidthPixels * sensorWidthMm * 10);

    return {
      reference: {
        type: referenceType,
        pixelWidth: detectedWidthPixels,
        pixelHeight: detectedHeightPixels,
        realWidthCm: realSize.width,
        realHeightCm: realSize.height,
      },
      pixelsPerCm,
      confidence: Math.max(0.5, Math.min(1, confidence)),
      distanceEstimateCm,
    };
  }

  /**
   * Calibrate from known height (simplest method)
   * User enters their height, we detect their full body height in pixels
   */
  createHeightCalibration(
    knownHeightCm: number,
    detectedHeightPixels: number
  ): CalibrationResult {
    const pixelsPerCm = detectedHeightPixels / knownHeightCm;

    return {
      reference: {
        type: 'known_height',
        pixelWidth: 0,
        pixelHeight: detectedHeightPixels,
        realWidthCm: 0,
        realHeightCm: knownHeightCm,
      },
      pixelsPerCm,
      confidence: 0.85, // Height-only calibration is less accurate than reference object
      distanceEstimateCm: 0,
    };
  }

  /**
   * Validate calibration consistency across multiple readings
   */
  validateCalibration(readings: CalibrationResult[]): {
    isConsistent: boolean;
    avgPixelsPerCm: number;
    stdDev: number;
    recommendation: string;
  } {
    if (readings.length < 2) {
      return {
        isConsistent: true,
        avgPixelsPerCm: readings[0]?.pixelsPerCm ?? 0,
        stdDev: 0,
        recommendation: 'Take at least 2 calibration readings for best accuracy',
      };
    }

    const values = readings.map(r => r.pixelsPerCm);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / mean;

    return {
      isConsistent: coeffOfVariation < 0.05, // Less than 5% variation
      avgPixelsPerCm: mean,
      stdDev,
      recommendation: coeffOfVariation >= 0.05
        ? 'Calibration readings are inconsistent. Please retake in consistent conditions.'
        : 'Calibration is consistent and reliable.',
    };
  }

  /**
   * Get calibration guide for user
   */
  getCalibrationGuide(referenceType: keyof typeof REFERENCE_SIZES): CalibrationGuide {
    const guides: Record<string, CalibrationGuide> = {
      credit_card: {
        referenceType: 'credit_card',
        instructions: [
          'Hold a standard credit/debit card flat against your body at waist level',
          'Ensure the card is fully visible and not tilted',
          'The card should be in the same plane as your body (not angled toward/away from camera)',
          'Take the photo from the same distance you\'ll use for body scan',
        ],
        tips: [
          'Any standard payment card works (8.56cm × 5.398cm)',
          'Don\'t use cards with unusual sizes (mini cards, etc.)',
          'Good lighting helps edge detection',
        ],
        badExamples: [
          'Card tilted at an angle',
          'Card partially hidden',
          'Card too far from body',
        ],
      },
      a4_paper: {
        referenceType: 'a4_paper',
        instructions: [
          'Hold an A4 sheet of paper flat against a wall or your body',
          'Ensure all four corners are visible',
          'Keep the paper flat (no bending or curling)',
          'Stand at the same distance you\'ll use for body scan',
        ],
        tips: [
          'A4 is the most common printer paper size (21cm × 29.7cm)',
          'Larger reference = better accuracy',
          'Use a clipboard to keep paper flat',
        ],
        badExamples: [
          'Paper is crumpled or bent',
          'Only part of the paper is visible',
          'Paper is at an angle to camera',
        ],
      },
      ruler: {
        referenceType: 'ruler',
        instructions: [
          'Hold a 30cm ruler horizontally at waist level',
          'Ensure the full ruler is visible in frame',
          'Keep the ruler parallel to the camera (not tilted)',
          'Take from the same distance as body scan',
        ],
        tips: [
          'A rigid ruler works better than a tape measure',
          'Metal or wooden rulers stay straight',
          'Ensure both ends of the ruler are in frame',
        ],
        badExamples: [
          'Ruler is bent or flexed',
          'Ruler is at an angle',
          'Ends of ruler are out of frame',
        ],
      },
    };

    return guides[referenceType] || guides.credit_card;
  }

  /**
   * Auto-detect reference object in image (placeholder for ML-based detection)
   * In production, this would use:
   * - Edge detection (Canny) to find rectangular objects
   * - Contour analysis to identify credit cards / paper
   * - Known aspect ratio matching
   */
  async detectReferenceObject(
    imageUri: string
  ): Promise<{
    detected: boolean;
    type: keyof typeof REFERENCE_SIZES | null;
    bounds: { x: number; y: number; width: number; height: number } | null;
    pixelWidth: number;
    pixelHeight: number;
  }> {
    // TODO: Implement ML-based reference object detection
    // For now, this requires manual input from user
    // 
    // Production implementation options:
    // 1. Cloud API with OpenCV: Send image to server for edge/contour detection
    // 2. React Native OpenCV: Use react-native-opencv for on-device detection
    // 3. Custom TFLite model: Train a model to detect standard reference objects
    
    return {
      detected: false,
      type: null,
      bounds: null,
      pixelWidth: 0,
      pixelHeight: 0,
    };
  }
}

export const referenceCalibrationService = new ReferenceCalibrationService();
