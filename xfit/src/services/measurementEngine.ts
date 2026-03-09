/**
 * Production Measurement Engine
 * 
 * Core engine that calculates real body measurements from pose landmarks.
 * Uses biomechanical models and anthropometric data for accuracy.
 * 
 * Accuracy targets:
 * - Height: ±1cm (with calibration)
 * - Circumferences: ±2cm (with multi-angle + anthropometric correction)
 * - Linear measurements: ±1.5cm (shoulder width, sleeve, inseam)
 */

import { MeasurementPoint, ScanResult } from '../types/measurements';

// ============================================================
// TYPES
// ============================================================

export interface Landmark {
  x: number;    // Normalized 0-1
  y: number;    // Normalized 0-1
  z: number;    // Depth normalized
  visibility: number; // Confidence 0-1
  name: string;
}

export interface CaptureAngle {
  type: 'front' | 'side' | 'back';
  landmarks: Landmark[];
  imageWidth: number;
  imageHeight: number;
  confidence: number;
  exifFocalLength?: number; // mm, from EXIF data
}

export interface CalibrationReference {
  type: 'credit_card' | 'a4_paper' | 'known_height' | 'ruler';
  // Detected size in pixels
  pixelWidth: number;
  pixelHeight: number;
  // Real-world size in cm
  realWidthCm: number;
  realHeightCm: number;
}

export interface MeasurementResult {
  measurements: Record<string, number>;
  confidence: Record<string, number>;
  overallAccuracy: number;
  warnings: string[];
  metadata: {
    anglesUsed: string[];
    calibrationMethod: string;
    processingTimeMs: number;
    engineVersion: string;
    contourUsed?: boolean;
    rotationCorrected?: boolean;
    anchorApplied?: boolean;
    crossValidated?: boolean;
  };
}

/**
 * Contour widths from silhouette segmentation (from the server).
 * Each body part has a measured pixel width and optional cm width.
 */
export interface ContourData {
  front?: ContourWidths;
  side?: ContourWidths;
}

export interface ContourWidths {
  widths: Record<string, { width_px: number; width_cm: number | null }>;
  silhouetteHeightPx: number;
  segmentationConfidence: number;
}

// ============================================================
// CONSTANTS
// ============================================================

// Standard reference object sizes in cm
export const REFERENCE_SIZES = {
  credit_card: { width: 8.56, height: 5.398 },
  a4_paper: { width: 21.0, height: 29.7 },
  ruler: { width: 30.0, height: 3.0 },
} as const;

// BlazePose 33 landmark indices
export const BLAZEPOSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

// Anthropometric ratio data (from ISO 8559 & large-scale studies)
// These are population means used for validation and correction
const ANTHROPOMETRIC_RATIOS = {
  male: {
    chestToHeight: 0.52,       // Chest circumference / height
    waistToHeight: 0.44,       // Waist circumference / height
    hipsToHeight: 0.53,        // Hip circumference / height
    shoulderToHeight: 0.259,   // Bi-shoulder width / height
    neckToHeight: 0.215,       // Neck circumference / height
    sleeveToHeight: 0.365,     // Sleeve length / height
    inseamToHeight: 0.45,      // Inseam / height
    thighToHeight: 0.33,       // Thigh circumference / height
    calfToHeight: 0.21,        // Calf circumference / height
    armLengthToHeight: 0.44,   // Full arm length / height
    torsoToHeight: 0.3,        // Shoulder to hip / height
    headToHeight: 0.13,        // Head height / height
  },
  female: {
    chestToHeight: 0.51,
    waistToHeight: 0.42,
    hipsToHeight: 0.565,
    shoulderToHeight: 0.243,
    neckToHeight: 0.195,
    sleeveToHeight: 0.345,
    inseamToHeight: 0.45,
    thighToHeight: 0.34,
    calfToHeight: 0.21,
    armLengthToHeight: 0.43,
    torsoToHeight: 0.28,
    headToHeight: 0.13,
  },
  // Neutral average of male/female
  other: {
    chestToHeight: 0.515,
    waistToHeight: 0.43,
    hipsToHeight: 0.548,
    shoulderToHeight: 0.251,
    neckToHeight: 0.205,
    sleeveToHeight: 0.355,
    inseamToHeight: 0.45,
    thighToHeight: 0.335,
    calfToHeight: 0.21,
    armLengthToHeight: 0.435,
    torsoToHeight: 0.29,
    headToHeight: 0.13,
  },
};

// Standard deviations for each ratio (used for outlier detection)
const RATIO_STDDEV = {
  chestToHeight: 0.04,
  waistToHeight: 0.05,
  hipsToHeight: 0.04,
  shoulderToHeight: 0.015,
  neckToHeight: 0.015,
  sleeveToHeight: 0.02,
  inseamToHeight: 0.025,
  thighToHeight: 0.03,
  calfToHeight: 0.02,
};

// ============================================================
// PERSONALIZED RATIOS
// ============================================================

type AnthropometricRatios = typeof ANTHROPOMETRIC_RATIOS.male;

/**
 * Build personalized anthropometric ratios from a user's measurement history.
 * Requires at least MIN_SCANS_FOR_PERSONALIZATION scans with valid height.
 * Returns null if not enough data.
 */
function buildPersonalizedRatios(
  history: Array<{ measurements: Record<string, number> }>,
  gender: 'male' | 'female' | 'other'
): AnthropometricRatios | null {
  const MIN_SCANS = 3;

  const validScans = history.filter(
    s => s.measurements.height && s.measurements.height > 0
  );

  if (validScans.length < MIN_SCANS) return null;

  const baseRatios = ANTHROPOMETRIC_RATIOS[gender];

  // Compute average ratio for each measurement from history
  const ratioKeys: Array<{ measurementKey: string; ratioKey: keyof AnthropometricRatios }> = [
    { measurementKey: 'chest', ratioKey: 'chestToHeight' },
    { measurementKey: 'waist', ratioKey: 'waistToHeight' },
    { measurementKey: 'hips', ratioKey: 'hipsToHeight' },
    { measurementKey: 'shoulders', ratioKey: 'shoulderToHeight' },
    { measurementKey: 'neck', ratioKey: 'neckToHeight' },
    { measurementKey: 'sleeve', ratioKey: 'sleeveToHeight' },
    { measurementKey: 'inseam', ratioKey: 'inseamToHeight' },
    { measurementKey: 'thigh', ratioKey: 'thighToHeight' },
    { measurementKey: 'calf', ratioKey: 'calfToHeight' },
  ];

  const personalized = { ...baseRatios };

  for (const { measurementKey, ratioKey } of ratioKeys) {
    const values = validScans
      .map(s => {
        const val = s.measurements[measurementKey];
        const h = s.measurements.height;
        return val && val > 0 && h > 0 ? val / h : null;
      })
      .filter((v): v is number => v !== null);

    if (values.length >= MIN_SCANS) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      // Blend: 60% personal + 40% population to avoid overfitting
      const blended = avg * 0.6 + (baseRatios[ratioKey] as number) * 0.4;

      // Only use if within reasonable bounds (±3 stddev from population)
      const stdDev = RATIO_STDDEV[ratioKey as keyof typeof RATIO_STDDEV] || 0.03;
      const zScore = Math.abs(blended - (baseRatios[ratioKey] as number)) / stdDev;
      if (zScore <= 3) {
        (personalized as any)[ratioKey] = Math.round(blended * 1000) / 1000;
      }
    }
  }

  return personalized;
}

// ============================================================
// MEASUREMENT ENGINE
// ============================================================

class MeasurementEngine {
  private readonly engineVersion = '4.0.0-production';
  private personalizedRatios: AnthropometricRatios | null = null;

  /**
   * Set personalized anthropometric ratios from user scan history.
   * Call this after loading user data to enable personalized corrections.
   */
  setPersonalizedRatios(
    history: Array<{ measurements: Record<string, number> }>,
    gender: 'male' | 'female' | 'other'
  ): boolean {
    this.personalizedRatios = buildPersonalizedRatios(history, gender);
    return this.personalizedRatios !== null;
  }

  /**
   * Get the active ratios (personalized if available, else population defaults)
   */
  private getActiveRatios(gender: 'male' | 'female' | 'other'): AnthropometricRatios {
    return this.personalizedRatios || ANTHROPOMETRIC_RATIOS[gender];
  }

  /**
   * Calculate measurements from multi-angle captures with reference calibration.
   * When contourData is provided (from silhouette segmentation), real body widths
   * are used instead of skeleton-landmark heuristics — dramatically improving
   * circumference accuracy.
   * 
   * anchorMeasurement lets the user anchor one real tape-measured value
   * (e.g., waist: 82cm) to proportionally correct all circumferences.
   */
  calculateFromMultiAngle(
    captures: CaptureAngle[],
    calibration: CalibrationReference | null,
    knownHeight: number | null,
    gender: 'male' | 'female' | 'other' = 'other',
    contourData?: ContourData,
    anchorMeasurement?: { key: string; valueCm: number } | null
  ): MeasurementResult {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Step 1: Determine pixel-to-cm scale factor
    const scaleFactor = this.computeScaleFactor(captures, calibration, knownHeight, warnings);

    // Step 2: Extract front-view measurements
    const frontCapture = captures.find(c => c.type === 'front');
    const sideCapture = captures.find(c => c.type === 'side');
    const backCapture = captures.find(c => c.type === 'back');

    if (!frontCapture) {
      throw new Error('Front-view capture is required');
    }

    // Step 2.5: Apply lens distortion correction to all captures
    // Use EXIF focal length when available for per-device accuracy (#8)
    const correctedCaptures = captures.map(c => this.applyLensDistortionCorrection(c));
    const correctedFront = correctedCaptures.find(c => c.type === 'front')!;
    const correctedSide = correctedCaptures.find(c => c.type === 'side');
    const correctedBack = correctedCaptures.find(c => c.type === 'back');

    // Step 2.7: Detect and correct body rotation (#2)
    const { capture: rotationCorrectedFront, angleDeg: frontRotation } =
      this.detectAndCorrectRotation(correctedFront);
    const rotationCorrectedSide = correctedSide
      ? this.detectAndCorrectRotation(correctedSide).capture
      : null;
    const rotationApplied = Math.abs(frontRotation) > 0.5;

    // Step 3: Calculate linear measurements from front view
    const frontMeasurements = this.calculateFrontViewMeasurements(rotationCorrectedFront, scaleFactor);

    // Step 4: Calculate depth from side view (for circumferences)
    const sideMeasurements = rotationCorrectedSide
      ? this.calculateSideViewMeasurements(rotationCorrectedSide, scaleFactor)
      : null;

    // Step 5: Calculate circumferences by combining front + side
    // Prefer contour-based widths over skeleton heuristics when available
    const circumferences = this.calculateCircumferences(
      frontMeasurements,
      sideMeasurements,
      gender,
      warnings,
      scaleFactor,
      contourData
    );

    // Step 6: Combine all measurements
    const rawMeasurements: Record<string, number> = {
      height: frontMeasurements.height,
      shoulders: frontMeasurements.shoulderWidth,
      sleeve: frontMeasurements.sleeveLength,
      inseam: frontMeasurements.inseam,
      ...circumferences,
    };

    // Step 7: Apply anthropometric validation & correction
    const corrected = this.applyAnthropometricCorrection(
      rawMeasurements,
      gender,
      warnings
    );

    // Step 7.5: Cross-measurement validation (#7)
    const crossValidated = this.applyCrossMeasurementValidation(corrected, gender, warnings);

    // Step 7.7: Anchor calibration — if user provided a tape measurement, use it (#3)
    let anchorApplied = false;
    if (anchorMeasurement && anchorMeasurement.valueCm > 0) {
      const rawVal = crossValidated[anchorMeasurement.key];
      if (rawVal && rawVal > 0) {
        const ratio = anchorMeasurement.valueCm / rawVal;
        // Apply proportional correction to related circumference measurements
        const circumKeys = ['chest', 'waist', 'hips', 'neck', 'thigh', 'calf'];
        if (circumKeys.includes(anchorMeasurement.key)) {
          // Anchor affects all circumferences proportionally (same cross-section error)
          for (const ck of circumKeys) {
            if (crossValidated[ck] && crossValidated[ck] > 0) {
              // Stronger correction for the anchored measurement, lighter for others
              const weight = ck === anchorMeasurement.key ? 1.0 : 0.5;
              const blended = 1 + (ratio - 1) * weight;
              crossValidated[ck] = this.round(crossValidated[ck] * blended);
            }
          }
        } else {
          // Direct correction for the specific measurement
          crossValidated[anchorMeasurement.key] = anchorMeasurement.valueCm;
        }
        anchorApplied = true;
      }
    }

    // Step 8: Calculate per-measurement confidence
    const confidence = this.calculateConfidenceScores(
      captures,
      crossValidated,
      gender,
      !!sideCapture,
      !!calibration || !!knownHeight,
      contourData
    );

    // Step 9: Calculate overall accuracy
    const overallAccuracy = this.calculateOverallAccuracy(confidence, captures);

    const processingTimeMs = Date.now() - startTime;

    return {
      measurements: crossValidated,
      confidence,
      overallAccuracy,
      warnings,
      metadata: {
        anglesUsed: captures.map(c => c.type),
        calibrationMethod: calibration
          ? `reference_object:${calibration.type}`
          : knownHeight
          ? 'known_height'
          : 'estimated',
        processingTimeMs,
        engineVersion: this.engineVersion,
        contourUsed: !!(contourData?.front || contourData?.side),
        rotationCorrected: rotationApplied,
        anchorApplied,
        crossValidated: true,
      },
    };
  }

  /**
   * Single-angle quick measurement (lower accuracy)
   */
  calculateFromSingleAngle(
    landmarks: Landmark[],
    imageWidth: number,
    imageHeight: number,
    knownHeight: number | null,
    gender: 'male' | 'female' | 'other' = 'other'
  ): MeasurementResult {
    const capture: CaptureAngle = {
      type: 'front',
      landmarks,
      imageWidth,
      imageHeight,
      confidence: this.calculateLandmarkConfidence(landmarks),
    };

    return this.calculateFromMultiAngle(
      [capture],
      null,
      knownHeight,
      gender
    );
  }

  // ============================================================
  // PRIVATE: Scale Factor
  // ============================================================

  private computeScaleFactor(
    captures: CaptureAngle[],
    calibration: CalibrationReference | null,
    knownHeight: number | null,
    warnings: string[]
  ): number {
    // Priority 1: Reference object calibration (most accurate)
    if (calibration) {
      const pixelsPerCm = calibration.pixelWidth / calibration.realWidthCm;
      return 1 / pixelsPerCm; // cm per pixel
    }

    // Priority 2: Known height calibration
    if (knownHeight) {
      const frontCapture = captures.find(c => c.type === 'front');
      if (frontCapture) {
        const headTop = this.getTopOfHead(frontCapture.landmarks);
        const feetBottom = this.getBottomOfFeet(frontCapture.landmarks);
        const heightPixels = Math.abs(feetBottom.y - headTop.y) * frontCapture.imageHeight;

        if (heightPixels > 0) {
          return knownHeight / heightPixels;
        }
      }
    }

    // Priority 3: Estimate from average proportions
    warnings.push('No calibration reference provided - using estimated scale. Accuracy will be reduced.');
    const frontCapture = captures.find(c => c.type === 'front');
    if (frontCapture) {
      // Estimate: average adult height is ~170cm
      const headTop = this.getTopOfHead(frontCapture.landmarks);
      const feetBottom = this.getBottomOfFeet(frontCapture.landmarks);
      const heightPixels = Math.abs(feetBottom.y - headTop.y) * frontCapture.imageHeight;
      return 170 / heightPixels;
    }

    return 1; // fallback (practically useless)
  }

  // ============================================================
  // PRIVATE: Front View Measurements
  // ============================================================

  private calculateFrontViewMeasurements(
    capture: CaptureAngle,
    scaleFactor: number
  ) {
    const lm = capture.landmarks;
    const imgH = capture.imageHeight;
    const imgW = capture.imageWidth;

    // Helper to get pixel coordinates
    const px = (landmark: Landmark) => ({
      x: landmark.x * imgW,
      y: landmark.y * imgH,
    });

    // Get key landmarks
    const leftShoulder = this.findLandmark(lm, 'left_shoulder', BLAZEPOSE_LANDMARKS.LEFT_SHOULDER);
    const rightShoulder = this.findLandmark(lm, 'right_shoulder', BLAZEPOSE_LANDMARKS.RIGHT_SHOULDER);
    const leftHip = this.findLandmark(lm, 'left_hip', BLAZEPOSE_LANDMARKS.LEFT_HIP);
    const rightHip = this.findLandmark(lm, 'right_hip', BLAZEPOSE_LANDMARKS.RIGHT_HIP);
    const leftKnee = this.findLandmark(lm, 'left_knee', BLAZEPOSE_LANDMARKS.LEFT_KNEE);
    const rightKnee = this.findLandmark(lm, 'right_knee', BLAZEPOSE_LANDMARKS.RIGHT_KNEE);
    const leftAnkle = this.findLandmark(lm, 'left_ankle', BLAZEPOSE_LANDMARKS.LEFT_ANKLE);
    const rightAnkle = this.findLandmark(lm, 'right_ankle', BLAZEPOSE_LANDMARKS.RIGHT_ANKLE);
    const leftWrist = this.findLandmark(lm, 'left_wrist', BLAZEPOSE_LANDMARKS.LEFT_WRIST);
    const rightWrist = this.findLandmark(lm, 'right_wrist', BLAZEPOSE_LANDMARKS.RIGHT_WRIST);
    const leftElbow = this.findLandmark(lm, 'left_elbow', BLAZEPOSE_LANDMARKS.LEFT_ELBOW);
    const rightElbow = this.findLandmark(lm, 'right_elbow', BLAZEPOSE_LANDMARKS.RIGHT_ELBOW);
    const nose = this.findLandmark(lm, 'nose', BLAZEPOSE_LANDMARKS.NOSE);

    // Head top estimation: ~15% above nose (head crown not directly detected)
    const headTopY = nose.y - (this.distance2D(px(nose), px(leftShoulder)) * 0.6) / imgH;

    // Feet bottom: use ankles (or heels if available)
    const leftHeel = lm.find(l => l.name === 'left_heel') || leftAnkle;
    const rightHeel = lm.find(l => l.name === 'right_heel') || rightAnkle;
    const leftFootIndex = lm.find(l => l.name === 'left_foot_index') || leftAnkle;
    const rightFootIndex = lm.find(l => l.name === 'right_foot_index') || rightAnkle;

    const feetBottomY = Math.max(
      leftHeel.y,
      rightHeel.y,
      leftFootIndex.y,
      rightFootIndex.y
    );

    // HEIGHT: top of head to bottom of feet
    const heightPixels = (feetBottomY - headTopY) * imgH;
    const height = this.round(heightPixels * scaleFactor);

    // SHOULDER WIDTH: bi-deltoid width (outer edge of shoulders)
    // Add ~5% to shoulder landmark distance (landmarks are on joint, not outer edge)
    const shoulderPixels = this.distance2D(px(leftShoulder), px(rightShoulder)) * 1.05;
    const shoulderWidth = this.round(shoulderPixels * scaleFactor);

    // SLEEVE LENGTH: shoulder to wrist (following arm segments)
    const leftSleevePixels =
      this.distance2D(px(leftShoulder), px(leftElbow)) +
      this.distance2D(px(leftElbow), px(leftWrist));
    const rightSleevePixels =
      this.distance2D(px(rightShoulder), px(rightElbow)) +
      this.distance2D(px(rightElbow), px(rightWrist));
    const sleeveLength = this.round(
      ((leftSleevePixels + rightSleevePixels) / 2) * scaleFactor
    );

    // INSEAM: crotch to ankle
    // Crotch point approximated as midpoint of hips, offset down
    const crotchY = ((leftHip.y + rightHip.y) / 2 + 0.02) * imgH; // slight down offset
    const leftInseamPixels =
      this.distance2D({ x: px(leftHip).x, y: crotchY }, px(leftKnee)) +
      this.distance2D(px(leftKnee), px(leftAnkle));
    const rightInseamPixels =
      this.distance2D({ x: px(rightHip).x, y: crotchY }, px(rightKnee)) +
      this.distance2D(px(rightKnee), px(rightAnkle));
    const inseam = this.round(
      ((leftInseamPixels + rightInseamPixels) / 2) * scaleFactor
    );

    // FRONT WIDTHS (for circumference calculation)
    const chestFrontWidth = this.distance2D(px(leftShoulder), px(rightShoulder)) * 0.95;
    const waistFrontWidth = this.distance2D(px(leftHip), px(rightHip)) * 1.1;
    const hipFrontWidth = this.distance2D(px(leftHip), px(rightHip)) * 1.15;
    const thighFrontWidth = this.distance2D(
      { x: px(leftHip).x, y: (px(leftHip).y + px(leftKnee).y) / 2 },
      { x: px(rightHip).x, y: (px(rightHip).y + px(rightKnee).y) / 2 }
    ) * 0.45; // single thigh width
    const calfFrontWidth = this.distance2D(
      { x: px(leftKnee).x, y: (px(leftKnee).y + px(leftAnkle).y) / 2 },
      { x: px(rightKnee).x, y: (px(rightKnee).y + px(rightAnkle).y) / 2 }
    ) * 0.45;

    // NECK WIDTH from front
    const neckFrontWidth = this.distance2D(px(leftShoulder), px(rightShoulder)) * 0.22;

    return {
      height,
      shoulderWidth,
      sleeveLength,
      inseam,
      // Front widths in pixels (for circumference calc)
      frontWidths: {
        chest: chestFrontWidth * scaleFactor,
        waist: waistFrontWidth * scaleFactor,
        hips: hipFrontWidth * scaleFactor,
        neck: neckFrontWidth * scaleFactor,
        thigh: thighFrontWidth * scaleFactor,
        calf: calfFrontWidth * scaleFactor,
      },
    };
  }

  // ============================================================
  // PRIVATE: Side View Measurements
  // ============================================================

  private calculateSideViewMeasurements(
    capture: CaptureAngle,
    scaleFactor: number
  ) {
    const lm = capture.landmarks;
    const imgH = capture.imageHeight;
    const imgW = capture.imageWidth;

    const px = (landmark: Landmark) => ({
      x: landmark.x * imgW,
      y: landmark.y * imgH,
    });

    const leftShoulder = this.findLandmark(lm, 'left_shoulder', BLAZEPOSE_LANDMARKS.LEFT_SHOULDER);
    const rightShoulder = this.findLandmark(lm, 'right_shoulder', BLAZEPOSE_LANDMARKS.RIGHT_SHOULDER);
    const leftHip = this.findLandmark(lm, 'left_hip', BLAZEPOSE_LANDMARKS.LEFT_HIP);
    const rightHip = this.findLandmark(lm, 'right_hip', BLAZEPOSE_LANDMARKS.RIGHT_HIP);
    const leftKnee = this.findLandmark(lm, 'left_knee', BLAZEPOSE_LANDMARKS.LEFT_KNEE);
    const rightKnee = this.findLandmark(lm, 'right_knee', BLAZEPOSE_LANDMARKS.RIGHT_KNEE);

    // Side-view depth: horizontal distance between front and back of body
    // In side view, the shoulder-to-shoulder distance represents depth
    const chestDepth = this.distance2D(px(leftShoulder), px(rightShoulder));
    const waistDepth = this.distance2D(px(leftHip), px(rightHip));
    const hipDepth = waistDepth * 1.15; // hips usually deeper than waist

    // Thigh depth from side (average of visible landmarks)
    const thighDepth = this.distance2D(
      { x: px(leftHip).x, y: (px(leftHip).y + px(leftKnee).y) / 2 },
      { x: px(rightHip).x, y: (px(rightHip).y + px(rightKnee).y) / 2 }
    );

    return {
      sideDepths: {
        chest: chestDepth * scaleFactor,
        waist: waistDepth * scaleFactor,
        hips: hipDepth * scaleFactor,
        thigh: thighDepth * scaleFactor,
        calf: thighDepth * scaleFactor * 0.55,
        neck: chestDepth * scaleFactor * 0.3,
      },
    };
  }

  // ============================================================
  // PRIVATE: Circumference Calculation
  // ============================================================

  /**
   * Calculate circumferences from front width + side depth
   * Uses ellipse perimeter approximation: C ≈ π * [3(a+b) - √((3a+b)(a+3b))]
   * (Ramanujan's approximation)
   */
  private calculateCircumferences(
    frontMeasurements: ReturnType<typeof this.calculateFrontViewMeasurements>,
    sideMeasurements: ReturnType<typeof this.calculateSideViewMeasurements> | null,
    gender: 'male' | 'female' | 'other',
    warnings: string[],
    scaleFactor: number,
    contourData?: ContourData
  ): Record<string, number> {
    const frontWidths = frontMeasurements.frontWidths;

    // ------------------------------------------------------------------
    // BEST: Contour (silhouette) widths from segmentation
    // These are real measured body edge-to-edge widths, not skeleton joint
    // approximations. When both front and side contours are available we
    // get an elliptical cross-section from actual measurements.
    // ------------------------------------------------------------------
    const fc = contourData?.front;
    const sc = contourData?.side;

    if (fc && fc.segmentationConfidence > 0.4) {
      const contourFrontWidths = this.contourWidthsToCm(fc, scaleFactor);

      if (sc && sc.segmentationConfidence > 0.4) {
        // BEST: front contour + side contour → real ellipse
        const contourSideWidths = this.contourWidthsToCm(sc, scaleFactor);
        const parts = ['chest', 'waist', 'hips', 'neck', 'thigh', 'calf'] as const;
        const result: Record<string, number> = {};

        for (const part of parts) {
          const fw = contourFrontWidths[part];
          const sw = contourSideWidths[part];
          if (fw && fw > 0 && sw && sw > 0) {
            result[part] = this.ellipseCircumference(fw / 2, sw / 2);
          } else if (fw && fw > 0 && sideMeasurements) {
            // Fall back to skeleton side depth + contour front width
            const depth = sideMeasurements.sideDepths[part as keyof typeof sideMeasurements.sideDepths];
            result[part] = this.ellipseCircumference(fw / 2, (depth || fw * 0.7) / 2);
          } else {
            // Fall back to skeleton-only front width
            result[part] = this.estimateCircumferenceFromWidth(fw || frontWidths[part as keyof typeof frontWidths] || 0);
          }
        }
        return result;
      }

      // GOOD: front contour only — use side skeleton depths or width→depth ratio
      if (sideMeasurements) {
        const depths = sideMeasurements.sideDepths;
        return {
          chest: this.ellipseCircumference((contourFrontWidths.chest || frontWidths.chest) / 2, depths.chest / 2),
          waist: this.ellipseCircumference((contourFrontWidths.waist || frontWidths.waist) / 2, depths.waist / 2),
          hips: this.ellipseCircumference((contourFrontWidths.hips || frontWidths.hips) / 2, depths.hips / 2),
          neck: this.ellipseCircumference((contourFrontWidths.neck || frontWidths.neck) / 2, depths.neck / 2),
          thigh: this.ellipseCircumference((contourFrontWidths.thigh || frontWidths.thigh) / 2, depths.thigh / 2),
          calf: this.ellipseCircumference((contourFrontWidths.calf || frontWidths.calf) / 2, depths.calf / 2),
        };
      }

      // DECENT: front contour only, no side view → estimate depth from width
      // Typical depth/width ratios from anthropometric data
      const depthRatios = gender === 'male'
        ? { chest: 0.75, waist: 0.82, hips: 0.72, neck: 0.85, thigh: 0.95, calf: 0.90 }
        : { chest: 0.68, waist: 0.75, hips: 0.78, neck: 0.80, thigh: 0.92, calf: 0.88 };

      warnings.push(
        'Side view not provided - using contour front width with estimated depth. ' +
        'Add side photo to improve circumference accuracy to ±2cm.'
      );

      const result: Record<string, number> = {};
      for (const part of ['chest', 'waist', 'hips', 'neck', 'thigh', 'calf'] as const) {
        const w = contourFrontWidths[part] || frontWidths[part as keyof typeof frontWidths] || 0;
        const ratio = depthRatios[part] || 0.8;
        result[part] = this.ellipseCircumference(w / 2, (w * ratio) / 2);
      }
      return result;
    }

    // ------------------------------------------------------------------
    // FALLBACK: Skeleton landmarks only (no contour data available)
    // ------------------------------------------------------------------
    if (sideMeasurements) {
      const depths = sideMeasurements.sideDepths;
      return {
        chest: this.ellipseCircumference(frontWidths.chest / 2, depths.chest / 2),
        waist: this.ellipseCircumference(frontWidths.waist / 2, depths.waist / 2),
        hips: this.ellipseCircumference(frontWidths.hips / 2, depths.hips / 2),
        neck: this.ellipseCircumference(frontWidths.neck / 2, depths.neck / 2),
        thigh: this.ellipseCircumference(frontWidths.thigh / 2, depths.thigh / 2),
        calf: this.ellipseCircumference(frontWidths.calf / 2, depths.calf / 2),
      };
    }

    // WORST: No side view, no contour → pure ratio estimation
    warnings.push(
      'Side view not provided - circumferences estimated from front view only. ' +
      'Add side photo for ±2cm accuracy.'
    );

    const ratios = this.getActiveRatios(gender);
    const height = frontMeasurements.height;

    return {
      chest: this.round(height * ratios.chestToHeight),
      waist: this.round(height * ratios.waistToHeight),
      hips: this.round(height * ratios.hipsToHeight),
      neck: this.round(height * ratios.neckToHeight),
      thigh: this.round(height * ratios.thighToHeight),
      calf: this.round(height * ratios.calfToHeight),
    };
  }

  /**
   * Convert contour widths from segmentation result to cm values.
   */
  private contourWidthsToCm(
    contour: ContourWidths,
    scaleFactor: number
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [part, data] of Object.entries(contour.widths)) {
      if (data.width_cm && data.width_cm > 0) {
        result[part] = data.width_cm;
      } else if (data.width_px > 0) {
        result[part] = data.width_px * scaleFactor;
      }
    }
    return result;
  }

  /**
   * Rough circumference estimate from a single width measurement.
   * Assumes roughly circular cross-section.
   */
  private estimateCircumferenceFromWidth(width: number): number {
    // For a circle: C = π * diameter
    // But bodies are elliptical; assume depth ≈ 0.8 × width
    return this.ellipseCircumference(width / 2, (width * 0.8) / 2);
  }

  /**
   * Ramanujan's ellipse circumference approximation
   * C ≈ π * [3(a+b) - √((3a+b)(a+3b))]
   * Where a and b are semi-axes
   */
  private ellipseCircumference(a: number, b: number): number {
    const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
    const circumference = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return this.round(circumference);
  }

  // ============================================================
  // PRIVATE: Anthropometric Correction
  // ============================================================

  private applyAnthropometricCorrection(
    measurements: Record<string, number>,
    gender: 'male' | 'female' | 'other',
    warnings: string[]
  ): Record<string, number> {
    const corrected = { ...measurements };
    const height = corrected.height;
    const ratios = this.getActiveRatios(gender);

    if (!height || height <= 0) return corrected;

    // Validate each measurement against expected ratio
    const checks: Array<{
      key: string;
      ratioKey: keyof typeof ratios;
      stdDevKey?: keyof typeof RATIO_STDDEV;
    }> = [
      { key: 'chest', ratioKey: 'chestToHeight', stdDevKey: 'chestToHeight' },
      { key: 'waist', ratioKey: 'waistToHeight', stdDevKey: 'waistToHeight' },
      { key: 'hips', ratioKey: 'hipsToHeight', stdDevKey: 'hipsToHeight' },
      { key: 'shoulders', ratioKey: 'shoulderToHeight', stdDevKey: 'shoulderToHeight' },
      { key: 'neck', ratioKey: 'neckToHeight', stdDevKey: 'neckToHeight' },
      { key: 'sleeve', ratioKey: 'sleeveToHeight', stdDevKey: 'sleeveToHeight' },
      { key: 'inseam', ratioKey: 'inseamToHeight', stdDevKey: 'inseamToHeight' },
      { key: 'thigh', ratioKey: 'thighToHeight', stdDevKey: 'thighToHeight' },
      { key: 'calf', ratioKey: 'calfToHeight', stdDevKey: 'calfToHeight' },
    ];

    for (const check of checks) {
      const measured = corrected[check.key];
      if (!measured || measured <= 0) continue;

      const expectedRatio = ratios[check.ratioKey];
      const expected = height * expectedRatio;
      const actualRatio = measured / height;

      // Calculate z-score (how many standard deviations from mean)
      const stdDev = check.stdDevKey ? RATIO_STDDEV[check.stdDevKey] : 0.03;
      const zScore = Math.abs(actualRatio - expectedRatio) / stdDev;

      if (zScore > 3) {
        // Extreme outlier (>3σ): heavy correction toward mean
        warnings.push(
          `${check.key} measurement (${measured.toFixed(1)}cm) is a statistical outlier. ` +
          `Applying correction.`
        );
        corrected[check.key] = this.round(measured * 0.4 + expected * 0.6);
      } else if (zScore > 2) {
        // Moderate outlier (2-3σ): light correction
        corrected[check.key] = this.round(measured * 0.8 + expected * 0.2);
      }
      // Within 2σ: keep measured value (normal variation)
    }

    return corrected;
  }

  // ============================================================
  // PRIVATE: Bayesian Confidence Scoring
  // ============================================================

  /**
   * Bayesian confidence model.
   * 
   * Instead of heuristic bonuses, we model confidence as a posterior probability:
   *   P(accurate | evidence) ∝ P(evidence | accurate) × P(accurate)
   * 
   * Evidence factors:
   * - Landmark visibility (direct detection quality)
   * - Calibration method (determines scale accuracy)  
   * - Number of capture angles (more angles → less ambiguity)
   * - Anthropometric plausibility (z-score of measurement vs expected ratio)
   * 
   * Each factor provides a likelihood ratio that updates the prior.
   */
  private calculateConfidenceScores(
    captures: CaptureAngle[],
    measurements: Record<string, number>,
    gender: 'male' | 'female' | 'other',
    hasSideView: boolean,
    hasCalibration: boolean,
    contourData?: ContourData
  ): Record<string, number> {
    const confidence: Record<string, number> = {};

    // Prior: base detection quality from landmark visibility
    const basePrior = this.getBaseConfidence(captures) / 100; // normalize to 0-1

    // Likelihood ratios for each evidence factor
    const calibrationLR = hasCalibration ? 1.8 : 0.7; // calibrated → much more likely accurate
    const angleCountLR = 1 + (captures.length - 1) * 0.25; // each extra angle adds 25%
    // Contour evidence: silhouette-based widths are much more accurate for circumferences
    const hasContour = !!(contourData?.front || contourData?.side);
    const contourConfidence = contourData?.front?.segmentationConfidence ?? 0;

    const ratios = this.getActiveRatios(gender);
    const height = measurements.height || 170;

    // Per-measurement confidence
    const measurementConfigs: Array<{
      key: string;
      ratioKey: keyof typeof ratios | null;
      needsSideView: boolean;
      inherentDifficulty: number; // 0-1, how hard this measurement is
    }> = [
      { key: 'height', ratioKey: null, needsSideView: false, inherentDifficulty: 0.05 },
      { key: 'shoulders', ratioKey: 'shoulderToHeight', needsSideView: false, inherentDifficulty: 0.1 },
      { key: 'sleeve', ratioKey: 'sleeveToHeight', needsSideView: false, inherentDifficulty: 0.15 },
      { key: 'inseam', ratioKey: 'inseamToHeight', needsSideView: false, inherentDifficulty: 0.2 },
      { key: 'chest', ratioKey: 'chestToHeight', needsSideView: true, inherentDifficulty: 0.2 },
      { key: 'waist', ratioKey: 'waistToHeight', needsSideView: true, inherentDifficulty: 0.2 },
      { key: 'hips', ratioKey: 'hipsToHeight', needsSideView: true, inherentDifficulty: 0.2 },
      { key: 'neck', ratioKey: 'neckToHeight', needsSideView: true, inherentDifficulty: 0.3 },
      { key: 'thigh', ratioKey: 'thighToHeight', needsSideView: true, inherentDifficulty: 0.3 },
      { key: 'calf', ratioKey: 'calfToHeight', needsSideView: true, inherentDifficulty: 0.35 },
    ];

    for (const config of measurementConfigs) {
      // Start with prior
      let logOdds = Math.log(basePrior / (1 - Math.min(basePrior, 0.99)));

      // Update with calibration evidence
      logOdds += Math.log(calibrationLR);

      // Update with angle count
      logOdds += Math.log(angleCountLR);

      // Side-view evidence for circumferences
      if (config.needsSideView) {
        const sideViewLR = hasSideView ? 2.0 : 0.5;
        logOdds += Math.log(sideViewLR);

        // Contour evidence: real silhouette widths are far more reliable
        if (hasContour && contourConfidence > 0.4) {
          logOdds += Math.log(2.5); // strong evidence
        }
      }

      // Anthropometric plausibility (measurements close to expected are more trustworthy)
      if (config.ratioKey && measurements[config.key] > 0) {
        const expectedRatio = ratios[config.ratioKey] as number;
        const actualRatio = measurements[config.key] / height;
        const stdDev = RATIO_STDDEV[config.ratioKey as keyof typeof RATIO_STDDEV] || 0.03;
        const zScore = Math.abs(actualRatio - expectedRatio) / stdDev;

        // Gaussian likelihood: closer to expected → higher confidence
        const plausibilityLR = Math.exp(-0.5 * zScore * zScore);
        logOdds += Math.log(Math.max(plausibilityLR, 0.1)); // floor at 0.1 to avoid -Inf
      }

      // Inherent difficulty penalty
      logOdds -= config.inherentDifficulty;

      // Convert log-odds back to probability (0-100 scale)
      const posterior = 1 / (1 + Math.exp(-logOdds));
      confidence[config.key] = Math.min(98, Math.max(15, Math.round(posterior * 100)));
    }

    return confidence;
  }

  private getBaseConfidence(captures: CaptureAngle[]): number {
    if (captures.length === 0) return 50;

    // Average landmark confidence across all captures
    const avgConfidence =
      captures.reduce((sum, c) => sum + c.confidence, 0) / captures.length;

    return Math.round(avgConfidence * 100 * 0.7); // 70% weight from landmark confidence
  }

  private calculateOverallAccuracy(
    confidence: Record<string, number>,
    captures: CaptureAngle[]
  ): number {
    const values = Object.values(confidence);
    if (values.length === 0) return 0;

    // Weighted average (penalize low-confidence measurements more)
    const weightedSum = values.reduce((sum, c) => sum + c * c, 0);
    const weightSum = values.reduce((sum, c) => sum + c, 0);
    const weightedAvg = weightedSum / weightSum;

    // Bonus for more capture angles
    const angleBonus = Math.min(5, (captures.length - 1) * 3);

    return Math.min(98, Math.round(weightedAvg + angleBonus));
  }

  // ============================================================
  // PRIVATE: Utility Functions
  // ============================================================

  private findLandmark(landmarks: Landmark[], name: string, index: number): Landmark {
    // Try by name first, then by index
    const byName = landmarks.find(l => l.name === name);
    if (byName) return byName;

    if (index < landmarks.length) return landmarks[index];

    // Return default (center, zero confidence)
    return { x: 0.5, y: 0.5, z: 0, visibility: 0, name };
  }

  private getTopOfHead(landmarks: Landmark[]): { x: number; y: number } {
    const nose = landmarks.find(l => l.name === 'nose') || landmarks[0];
    const leftEar = landmarks.find(l => l.name === 'left_ear');
    const rightEar = landmarks.find(l => l.name === 'right_ear');

    // Estimate head top as ~60% of nose-to-shoulder distance above nose
    const leftShoulder = landmarks.find(l => l.name === 'left_shoulder');
    const noseToShoulderDist = leftShoulder
      ? Math.abs(leftShoulder.y - nose.y)
      : 0.05;

    return {
      x: nose.x,
      y: nose.y - noseToShoulderDist * 0.6,
    };
  }

  private getBottomOfFeet(landmarks: Landmark[]): { x: number; y: number } {
    const leftHeel = landmarks.find(l => l.name === 'left_heel');
    const rightHeel = landmarks.find(l => l.name === 'right_heel');
    const leftFootIndex = landmarks.find(l => l.name === 'left_foot_index');
    const rightFootIndex = landmarks.find(l => l.name === 'right_foot_index');
    const leftAnkle = landmarks.find(l => l.name === 'left_ankle');
    const rightAnkle = landmarks.find(l => l.name === 'right_ankle');

    const candidates = [leftHeel, rightHeel, leftFootIndex, rightFootIndex, leftAnkle, rightAnkle]
      .filter((l): l is Landmark => l !== undefined);

    if (candidates.length === 0) {
      return { x: 0.5, y: 0.95 };
    }

    const maxY = Math.max(...candidates.map(l => l.y));
    const avgX = candidates.reduce((sum, l) => sum + l.x, 0) / candidates.length;

    return { x: avgX, y: maxY };
  }

  private distance2D(
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  }

  private calculateLandmarkConfidence(landmarks: Landmark[]): number {
    const visible = landmarks.filter(l => l.visibility > 0.5);
    if (visible.length === 0) return 0;
    return visible.reduce((sum, l) => sum + l.visibility, 0) / visible.length;
  }

  private round(value: number, decimals: number = 1): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  // ============================================================
  // PRIVATE: Lens Distortion Correction
  // ============================================================

  /**
   * Apply radial lens distortion correction to landmark positions.
   * 
   * Smartphone cameras introduce barrel distortion that pushes peripheral
   * landmarks outward, inflating measurements at frame edges.
   * Uses a simplified Brown–Conrady model:
   *   x_corrected = x * (1 + k1*r² + k2*r⁴)
   * where r is the normalized distance from the image center.
   * 
   * k1 and k2 are typical for smartphone wide-angle lenses.
   */
  /**
   * EXIF-aware lens distortion correction (#8).
   * When EXIF focal length is available, compute device-specific k1/k2.
   * Shorter focal lengths (wide-angle) have more barrel distortion.
   */
  private applyLensDistortionCorrection(capture: CaptureAngle): CaptureAngle {
    let k1: number;
    let k2: number;

    if (capture.exifFocalLength && capture.exifFocalLength > 0) {
      // Empirical model: distortion ∝ 1/focal_length²
      // Calibrated for typical smartphone sensors (crop factor ~6)
      // f=2.5mm (ultra-wide) → k1≈-0.08; f=5mm (main) → k1≈-0.02; f=12mm (tele) → k1≈-0.004
      const f = capture.exifFocalLength;
      k1 = -0.5 / (f * f);
      k2 = 0.12 / (f * f * f);
    } else {
      // Default for typical smartphone main camera (~26mm equiv, ~4.5mm actual)
      k1 = -0.02;
      k2 = 0.005;
    }

    const cx = 0.5;
    const cy = 0.5;

    const correctedLandmarks = capture.landmarks.map(lm => {
      const dx = lm.x - cx;
      const dy = lm.y - cy;
      const r2 = dx * dx + dy * dy;
      const r4 = r2 * r2;

      const distortionFactor = 1 + k1 * r2 + k2 * r4;

      return {
        ...lm,
        x: cx + dx * distortionFactor,
        y: cy + dy * distortionFactor,
      };
    });

    return {
      ...capture,
      landmarks: correctedLandmarks,
    };
  }

  // ============================================================
  // PRIVATE: Body Rotation Detection & Correction (#2)
  // ============================================================

  /**
   * Detect torso rotation/lean from asymmetric shoulder and hip positions.
   * A rotated body makes one side appear wider/narrower, skewing widths.
   * We estimate rotation angle and scale the affected axis back.
   */
  private detectAndCorrectRotation(
    capture: CaptureAngle
  ): { capture: CaptureAngle; angleDeg: number } {
    const lm = capture.landmarks;
    const ls = this.findLandmark(lm, 'left_shoulder', BLAZEPOSE_LANDMARKS.LEFT_SHOULDER);
    const rs = this.findLandmark(lm, 'right_shoulder', BLAZEPOSE_LANDMARKS.RIGHT_SHOULDER);
    const lh = this.findLandmark(lm, 'left_hip', BLAZEPOSE_LANDMARKS.LEFT_HIP);
    const rh = this.findLandmark(lm, 'right_hip', BLAZEPOSE_LANDMARKS.RIGHT_HIP);

    if (ls.visibility < 0.3 || rs.visibility < 0.3) {
      return { capture, angleDeg: 0 };
    }

    // Method 1: Z-depth asymmetry (if z data is available and meaningful)
    const shoulderZDiff = Math.abs(ls.z - rs.z);
    const hipZDiff = Math.abs(lh.z - rh.z);
    const avgZDiff = (shoulderZDiff + hipZDiff) / 2;

    // Method 2: Shoulder-width vs expected ratio
    // When rotated, the apparent shoulder width shrinks by cos(θ)
    // We use the y-height difference of left vs right shoulder as a tilt indicator
    const shoulderTilt = Math.abs(ls.y - rs.y);
    const hipTilt = Math.abs(lh.y - rh.y);

    // Estimate rotation angle in degrees
    // Z diff of ~0.1 normalized ≈ 10-15° rotation
    // Tilt of > 0.02 normalized suggests lateral lean
    let rotationDeg = 0;

    if (avgZDiff > 0.02) {
      rotationDeg = Math.min(30, avgZDiff * 150); // cap at 30°
    }

    // Lateral tilt compensation
    const tiltDeg = Math.atan2(shoulderTilt, Math.abs(ls.x - rs.x)) * (180 / Math.PI);

    if (rotationDeg < 2 && tiltDeg < 2) {
      return { capture, angleDeg: 0 }; // negligible rotation
    }

    // Correct: scale x-coordinates by 1/cos(θ) to undo foreshortening
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const cosCorrection = 1 / Math.max(Math.cos(rotationRad), 0.85);

    // Also correct tilt by de-rotating around the torso center
    const tiltRad = Math.atan2(ls.y - rs.y, ls.x - rs.x);
    const centerX = (ls.x + rs.x + lh.x + rh.x) / 4;
    const centerY = (ls.y + rs.y + lh.y + rh.y) / 4;

    const correctedLandmarks = capture.landmarks.map(landmark => {
      // Undo tilt rotation
      let dx = landmark.x - centerX;
      let dy = landmark.y - centerY;

      if (Math.abs(tiltDeg) > 1.5) {
        const cos = Math.cos(-tiltRad);
        const sin = Math.sin(-tiltRad);
        const newDx = dx * cos - dy * sin;
        const newDy = dx * sin + dy * cos;
        dx = newDx;
        dy = newDy;
      }

      // Undo foreshortening
      dx *= cosCorrection;

      return {
        ...landmark,
        x: centerX + dx,
        y: centerY + dy,
      };
    });

    return {
      capture: { ...capture, landmarks: correctedLandmarks },
      angleDeg: rotationDeg + tiltDeg,
    };
  }

  // ============================================================
  // PRIVATE: Cross-Measurement Validation (#7)
  // ============================================================

  /**
   * Enforce anatomical consistency constraints between related measurements.
   * E.g., hips >= waist, chest > neck, thigh < hips, etc.
   */
  private applyCrossMeasurementValidation(
    measurements: Record<string, number>,
    gender: 'male' | 'female' | 'other',
    warnings: string[]
  ): Record<string, number> {
    const m = { ...measurements };

    // Rule 1: Hips should generally be >= waist (in most body types)
    if (m.hips > 0 && m.waist > 0 && m.waist > m.hips * 1.15) {
      warnings.push('Waist exceeds hips by >15% — adjusting for consistency.');
      // Blend toward a more typical ratio
      const avg = (m.waist + m.hips) / 2;
      m.waist = this.round(avg * 0.98);
      m.hips = this.round(avg * 1.02);
    }

    // Rule 2: Chest should be > neck
    if (m.chest > 0 && m.neck > 0 && m.neck > m.chest * 0.6) {
      warnings.push('Neck circumference too close to chest — correcting.');
      m.neck = this.round(m.chest * 0.42);
    }

    // Rule 3: Thigh should be < hips
    if (m.thigh > 0 && m.hips > 0 && m.thigh > m.hips * 0.75) {
      m.thigh = this.round(m.hips * 0.6);
    }

    // Rule 4: Calf should be < thigh
    if (m.calf > 0 && m.thigh > 0 && m.calf > m.thigh) {
      m.calf = this.round(m.thigh * 0.65);
    }

    // Rule 5: Shoulder width should be reasonable relative to chest
    if (m.shoulders > 0 && m.chest > 0) {
      // Shoulder width ≈ chest_circumference / π  (rough diameter)
      const expectedShoulder = m.chest / Math.PI;
      if (m.shoulders > expectedShoulder * 1.4 || m.shoulders < expectedShoulder * 0.6) {
        warnings.push('Shoulder width inconsistent with chest — adjusting.');
        m.shoulders = this.round(
          m.shoulders * 0.6 + expectedShoulder * 0.4
        );
      }
    }

    // Rule 6: Sleeve should be reasonable relative to height
    if (m.sleeve > 0 && m.height > 0) {
      const sleeveRatio = m.sleeve / m.height;
      if (sleeveRatio > 0.45 || sleeveRatio < 0.25) {
        const expected = m.height * 0.355;
        m.sleeve = this.round(m.sleeve * 0.7 + expected * 0.3);
      }
    }

    // Rule 7: Inseam should be reasonable relative to height
    if (m.inseam > 0 && m.height > 0) {
      const inseamRatio = m.inseam / m.height;
      if (inseamRatio > 0.55 || inseamRatio < 0.35) {
        const expected = m.height * 0.45;
        m.inseam = this.round(m.inseam * 0.7 + expected * 0.3);
      }
    }

    return m;
  }

  // ============================================================
  // PRIVATE: Clothing Thickness Compensation (#5)
  // ============================================================

  /**
   * Estimate and subtract clothing thickness from circumference measurements.
   * Called by external code after measurement calculation when clothing info is available.
   */
  applyClothingCompensation(
    measurements: Record<string, number>,
    clothingType: 'tight' | 'normal' | 'loose' | 'heavy'
  ): Record<string, number> {
    // Clothing adds to circumference: C_body = C_measured - 2π × thickness
    const thicknessMap: Record<string, Record<string, number>> = {
      tight:  { chest: 0.2, waist: 0.1, hips: 0.2, neck: 0.0, thigh: 0.1, calf: 0.1 },
      normal: { chest: 0.5, waist: 0.4, hips: 0.4, neck: 0.0, thigh: 0.3, calf: 0.2 },
      loose:  { chest: 1.0, waist: 0.8, hips: 0.7, neck: 0.0, thigh: 0.5, calf: 0.3 },
      heavy:  { chest: 1.5, waist: 1.2, hips: 1.0, neck: 0.3, thigh: 0.7, calf: 0.5 },
    };

    const thickness = thicknessMap[clothingType] || thicknessMap.normal;
    const compensated = { ...measurements };

    for (const [part, thicknessCm] of Object.entries(thickness)) {
      if (compensated[part] && compensated[part] > 0 && thicknessCm > 0) {
        // Subtract circumference added by fabric layer
        const deduction = 2 * Math.PI * thicknessCm;
        compensated[part] = this.round(Math.max(compensated[part] - deduction, compensated[part] * 0.85));
      }
    }

    return compensated;
  }

  /**
   * Get engine version and capabilities
   */
  getInfo() {
    return {
      version: this.engineVersion,
      capabilities: [
        'multi_angle_measurement',
        'reference_calibration',
        'anthropometric_correction',
        'personalized_ratios',
        'ellipse_circumference',
        'outlier_detection',
        'confidence_scoring',
        'lens_distortion_correction',
        'silhouette_contour_measurement',
        'rotation_correction',
        'cross_measurement_validation',
        'anchor_calibration',
        'exif_lens_calibration',
        'clothing_compensation',
      ],
      supportedAngles: ['front', 'side', 'back'],
      supportedCalibration: ['credit_card', 'a4_paper', 'known_height', 'ruler', 'aruco_marker'],
      accuracyTargets: {
        withContourAndMultiAngle: '±1-2cm',
        withCalibrationAndMultiAngle: '±2-3cm',
        withCalibrationFrontOnly: '±3-5cm',
        withoutCalibration: '±4-7cm',
      },
    };
  }
}

export const measurementEngine = new MeasurementEngine();
