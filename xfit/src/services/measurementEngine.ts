/**
 * Production Measurement Engine
 * 
 * Core engine that estimates body measurements from pose landmarks.
 * Uses biomechanical models and anthropometric data for confidence scoring.
 * 
 * Validation targets:
 * - Report confidence by body part.
 * - Benchmark estimates against tape measurements before publishing MAE.
 * - Treat output as fit guidance until validation supports stronger claims.
 */

import { MeasurementPoint, ScanResult } from '../types/measurements';

const SHOULD_LOG_MEASUREMENT_ENGINE =
  typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test';
const engineLog = (...args: Parameters<typeof console.log>) => {
  if (SHOULD_LOG_MEASUREMENT_ENGINE) console.log(...args);
};
const engineWarn = (...args: Parameters<typeof console.warn>) => {
  if (SHOULD_LOG_MEASUREMENT_ENGINE) console.warn(...args);
};

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
  type: 'credit_card' | 'a4_paper' | 'known_height' | 'ruler' | 'aruco_marker' | 'floor_wall' | 'anchor_measurement';
  // Detected size in pixels
  pixelWidth: number;
  pixelHeight: number;
  // Real-world size in cm
  realWidthCm: number;
  realHeightCm: number;
  // Calibration quality metadata
  cmPerPixel?: number;
  confidence?: number;
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
    circumferenceSource?: string;
    missingRequiredAngles?: string[];
    calibrationConfidence?: number;
    contourConfidenceByPart?: Record<string, number>;
    rotationCorrected?: boolean;
    anchorApplied?: boolean;
    anchorMeasurement?: { key: string; valueCm: number };
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
  partConfidence?: Record<string, number>;
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

// Anthropometric ratio data (from ISO 8559-1:2017 & international studies)
// Ratios derived from Medium (M) size — population mean reference point
const ANTHROPOMETRIC_RATIOS = {
  male: {
    // ISO 8559 Male M: height=174, chest=96, waist=82, hips=96
    chestToHeight: 0.552,       // Chest circumference / height (96/174)
    waistToHeight: 0.471,       // Waist circumference / height (82/174)
    hipsToHeight: 0.552,        // Hip circumference / height (96/174)
    shoulderToHeight: 0.259,    // Bi-shoulder width / height (45/174)
    neckToHeight: 0.218,        // Neck circumference / height (38/174)
    sleeveToHeight: 0.356,      // Sleeve length / height (62/174)
    inseamToHeight: 0.466,      // Inseam / height (81/174)
    thighToHeight: 0.345,       // Thigh circumference / height (60/174)
    calfToHeight: 0.224,        // Calf circumference / height (39/174)
    armLengthToHeight: 0.44,    // Full arm length / height
    torsoToHeight: 0.3,         // Shoulder to hip / height
    headToHeight: 0.13,         // Head height / height
    underbustToHeight: 0.52,    // Male: underbust ≈ chest (no bust tissue)
    halfLengthToHeight: 0.18,   // Shoulder to waist
    topLengthToHeight: 0.25,    // Shoulder to hip
    bicepToHeight: 0.195,       // Upper arm circumference / height (34/174)
    elbowToHeight: 0.16,        // Elbow circumference / height (~28/174)
  },
  female: {
    // ISO 8559 Female M: height=162, bust=88, underbust=72, waist=70, hips=94
    chestToHeight: 0.543,       // Bust circumference / height (88/162)
    waistToHeight: 0.432,       // Waist circumference / height (70/162)
    hipsToHeight: 0.580,        // Hip circumference / height (94/162)
    shoulderToHeight: 0.235,    // Shoulder width / height (38/162)
    neckToHeight: 0.216,        // Neck circumference / height (35/162)
    sleeveToHeight: 0.364,      // Sleeve length / height (59/162)
    inseamToHeight: 0.481,      // Inseam / height (78/162)
    thighToHeight: 0.346,       // Thigh circumference / height (56/162)
    calfToHeight: 0.210,        // Calf circumference / height (34/162)
    armLengthToHeight: 0.43,    // Full arm length / height
    torsoToHeight: 0.28,        // Shoulder to hip / height
    headToHeight: 0.13,         // Head height / height
    underbustToHeight: 0.444,   // Under bust circumference / height (72/162)
    halfLengthToHeight: 0.175,  // Shoulder to waist (~28/162)
    topLengthToHeight: 0.25,    // Shoulder to hip (~40/162)
    bicepToHeight: 0.185,       // Upper arm circumference / height (30/162)
    elbowToHeight: 0.15,        // Elbow circumference / height (~24/162)
  },
  // Neutral average of male/female
  other: {
    chestToHeight: 0.548,
    waistToHeight: 0.452,
    hipsToHeight: 0.566,
    shoulderToHeight: 0.247,
    neckToHeight: 0.217,
    sleeveToHeight: 0.360,
    inseamToHeight: 0.474,
    thighToHeight: 0.346,
    calfToHeight: 0.217,
    armLengthToHeight: 0.435,
    torsoToHeight: 0.29,
    headToHeight: 0.13,
    underbustToHeight: 0.482,
    halfLengthToHeight: 0.178,
    topLengthToHeight: 0.25,
    bicepToHeight: 0.190,
    elbowToHeight: 0.155,
  },
};

// Standard deviations for each ratio (used for outlier detection)
// Standard deviations computed from ISO 8559-1 XS–XXL spread
// σ ≈ (XXL − XS) / 4  divided by reference height
const RATIO_STDDEV = {
  chestToHeight: 0.046,    // Male: (112-88)/4/174 ≈ 0.035, Female: (112-80)/4/162 ≈ 0.049 → avg
  waistToHeight: 0.057,    // Male: (102-72)/4/174 ≈ 0.043, Female: (94-60)/4/162 ≈ 0.052 → avg+margin
  hipsToHeight: 0.044,     // Male: (112-88)/4/174 ≈ 0.035, Female: (118-86)/4/162 ≈ 0.049 → avg
  shoulderToHeight: 0.018, // Male: (49-41)/4/174 ≈ 0.012, Female: (42-34)/4/162 ≈ 0.012 → widened
  neckToHeight: 0.017,     // Male: (42-36)/4/174 ≈ 0.009, Female: (37-33)/4/162 ≈ 0.006 → widened
  sleeveToHeight: 0.020,   // Male: (66-58)/4/174 ≈ 0.012, Female: (61-57)/4/162 ≈ 0.006 → widened
  inseamToHeight: 0.025,   // Modest variation across sizes; kept generous
  thighToHeight: 0.035,    // Male: (66-54)/4/174 ≈ 0.017, Female: (64-48)/4/162 ≈ 0.025 → widened
  calfToHeight: 0.022,     // Male: (43-35)/4/174 ≈ 0.012, Female: (38-30)/4/162 ≈ 0.012 → widened
  underbustToHeight: 0.042, // Female: (86-64)/4/162 ≈ 0.034, Male ≈ chest → avg
  bicepToHeight: 0.023,    // Male: (38-30)/4/174 ≈ 0.012, Female: (34-26)/4/162 ≈ 0.012 → widened
  elbowToHeight: 0.018,    // conservative widening
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
    { measurementKey: 'underbust', ratioKey: 'underbustToHeight' },
    { measurementKey: 'roundSleeveBicep', ratioKey: 'bicepToHeight' },
    { measurementKey: 'roundSleeveElbow', ratioKey: 'elbowToHeight' },
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

    // Step 1: Determine pixel-to-cm scale factor.
    // IMPORTANT: use the CORRECTED front capture (same landmarks that will be used
    // for all measurements) so that both scale computation and measurement use
    // identical y-coordinates. Using the original captures caused a ~3x inflation
    // on high-resolution (3048×4064) portrait phone images.
    const correctedCapturesForScale: CaptureAngle[] = [
      rotationCorrectedFront,
      ...(rotationCorrectedSide ? [rotationCorrectedSide] : []),
      ...(correctedBack ? [correctedBack] : []),
    ];
    const scaleFactor = this.computeScaleFactor(
      correctedCapturesForScale, calibration, knownHeight, warnings
    );

    if (SHOULD_LOG_MEASUREMENT_ENGINE) {
      engineLog('[MeasEngine] scaleFactor:', scaleFactor, 'captures:', captures.length,
        'types:', captures.map(c => c.type),
        'landmarks/capture:', captures.map(c => c.landmarks.length));
    }

    // Step 3: Calculate linear measurements from front view
    const frontMeasurements = this.calculateFrontViewMeasurements(
      rotationCorrectedFront, scaleFactor, knownHeight
    );

    if (SHOULD_LOG_MEASUREMENT_ENGINE) {
      engineLog('[MeasEngine] frontMeasurements:', JSON.stringify({
        height: frontMeasurements.height,
        shoulderWidth: frontMeasurements.shoulderWidth,
        sleeveLength: frontMeasurements.sleeveLength,
        inseam: frontMeasurements.inseam,
        frontWidths: frontMeasurements.frontWidths,
      }));
    }

    // Step 4: Calculate depth from side view (for circumferences)
    const sideMeasurements = rotationCorrectedSide
      ? this.calculateSideViewMeasurements(rotationCorrectedSide, scaleFactor)
      : null;
    const missingRequiredAngles = sideMeasurements ? [] : ['side'];
    const contourConfidenceByPart = this.getContourConfidenceByPart(contourData);

    if (SHOULD_LOG_MEASUREMENT_ENGINE && sideMeasurements) {
      engineLog('[MeasEngine] sideMeasurements:', JSON.stringify(sideMeasurements));
    }

    // Step 5: Calculate circumferences by combining front + side
    // Prefer contour-based widths over skeleton heuristics when available
    const circumferences = this.calculateCircumferences(
      frontMeasurements,
      sideMeasurements,
      warnings,
      scaleFactor,
      contourData
    );
    const circumferenceSource = this.getCircumferenceSource(sideMeasurements, contourData);

    // Step 6: Combine all measurements
    const rawMeasurements: Record<string, number> = {
      height: frontMeasurements.height,
      shoulders: frontMeasurements.shoulderWidth,
      sleeve: frontMeasurements.sleeveLength,
      inseam: frontMeasurements.inseam,
      ...circumferences,
    };

    // Step 6.1: Gender-specific additional measurements
    const effectiveHeight = rawMeasurements.height > 0
      ? rawMeasurements.height
      : (knownHeight && knownHeight > 0 ? knownHeight : 170);
    const genderRatiosStep6 = this.getActiveRatios(gender);

    // Arm measurements (useful for shirt/blouse fitting regardless of gender)
    rawMeasurements.roundSleeveBicep = this.round(effectiveHeight * genderRatiosStep6.bicepToHeight);
    rawMeasurements.roundSleeveElbow = this.round(effectiveHeight * genderRatiosStep6.elbowToHeight);

    // Female-specific garment length measurements
    if (gender === 'female') {
      rawMeasurements.halfLength = frontMeasurements.halfLength;
      rawMeasurements.topLength = frontMeasurements.topLength;
    }

    if (SHOULD_LOG_MEASUREMENT_ENGINE) {
      engineLog('[MeasEngine] rawMeasurements:', JSON.stringify(rawMeasurements));
      const nanKeys = Object.entries(rawMeasurements)
        .filter(([, v]) => !isFinite(v) || v <= 0)
        .map(([k]) => k);
      if (nanKeys.length > 0) {
        engineWarn('[MeasEngine] Invalid values detected for:', nanKeys.join(', '));
      }
    }

    // Step 6.5: Sanitize — replace NaN/Infinity with 0 before corrections
    const sanitizedRaw = this.sanitizeMeasurements(rawMeasurements);

    // Step 6.6: Anthropometric fallback — if most measurements are zero/invalid,
    // use ratio-based estimates from height so the user gets something useful.
    const zeroCount = Object.values(sanitizedRaw).filter(v => v <= 0).length;
    const referenceHeight = sanitizedRaw.height > 0
      ? sanitizedRaw.height
      : (knownHeight && knownHeight > 0 ? knownHeight : 170);
    if (zeroCount >= 5) {
      if (SHOULD_LOG_MEASUREMENT_ENGINE) engineWarn('[MeasEngine] Too many zero values, applying anthropometric fallback');
      warnings.push(sideMeasurements
        ? 'Measurements could not be fully calculated from poses. Using body-proportion fallback for missing values.'
        : 'Circumference measurements withheld until side view is captured; using fallback only for missing linear values.'
      );
      const ratios = this.getActiveRatios(gender);
      if (sanitizedRaw.height <= 0) sanitizedRaw.height = this.round(referenceHeight);
      if (sanitizedRaw.shoulders <= 0) sanitizedRaw.shoulders = this.round(referenceHeight * ratios.shoulderToHeight);
      if (sanitizedRaw.sleeve <= 0) sanitizedRaw.sleeve = this.round(referenceHeight * ratios.sleeveToHeight);
      if (sanitizedRaw.inseam <= 0) sanitizedRaw.inseam = this.round(referenceHeight * ratios.inseamToHeight);
      if (sideMeasurements) {
        if (sanitizedRaw.chest <= 0) sanitizedRaw.chest = this.round(referenceHeight * ratios.chestToHeight);
        if (sanitizedRaw.underbust <= 0) sanitizedRaw.underbust = this.round(referenceHeight * ratios.underbustToHeight);
        if (sanitizedRaw.waist <= 0) sanitizedRaw.waist = this.round(referenceHeight * ratios.waistToHeight);
        if (sanitizedRaw.hips <= 0) sanitizedRaw.hips = this.round(referenceHeight * ratios.hipsToHeight);
        if (sanitizedRaw.neck <= 0) sanitizedRaw.neck = this.round(referenceHeight * ratios.neckToHeight);
        if (sanitizedRaw.thigh <= 0) sanitizedRaw.thigh = this.round(referenceHeight * ratios.thighToHeight);
        if (sanitizedRaw.calf <= 0) sanitizedRaw.calf = this.round(referenceHeight * ratios.calfToHeight);
      } else {
        warnings.push('Anthropometric circumference fallback skipped because side view is required for depth.');
      }
      if ((sanitizedRaw.roundSleeveBicep ?? 0) <= 0) sanitizedRaw.roundSleeveBicep = this.round(referenceHeight * ratios.bicepToHeight);
      if ((sanitizedRaw.roundSleeveElbow ?? 0) <= 0) sanitizedRaw.roundSleeveElbow = this.round(referenceHeight * ratios.elbowToHeight);
      if (gender === 'female') {
        if ((sanitizedRaw.halfLength ?? 0) <= 0) sanitizedRaw.halfLength = this.round(referenceHeight * ratios.halfLengthToHeight);
        if ((sanitizedRaw.topLength ?? 0) <= 0) sanitizedRaw.topLength = this.round(referenceHeight * ratios.topLengthToHeight);
      }
    }

    // Step 7: Apply anthropometric validation & correction
    const corrected = this.applyAnthropometricCorrection(
      sanitizedRaw,
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
        const circumKeys = ['chest', 'underbust', 'waist', 'hips', 'neck', 'thigh', 'calf', 'roundSleeveBicep', 'roundSleeveElbow'];
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
      contourData,
      contourConfidenceByPart
    );

    // Step 9: Calculate overall accuracy
    // Penalize if measurements are missing/zero (NaN was sanitized to 0)
    const validMeasurementCount = Object.values(crossValidated).filter(v => v > 0).length;
    const totalMeasurementCount = Object.keys(crossValidated).length;
    const overallAccuracy = validMeasurementCount === 0
      ? 0
      : this.calculateOverallAccuracy(confidence, captures);

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
        circumferenceSource,
        missingRequiredAngles,
        calibrationConfidence: (calibration as any)?.confidence ?? (calibration as any)?.reference?.confidence,
        contourConfidenceByPart,
        rotationCorrected: rotationApplied,
        anchorApplied,
        anchorMeasurement: anchorApplied && anchorMeasurement ? anchorMeasurement : undefined,
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
    // NOTE: Height-only calibration (type='known_height') sets pixelWidth=0
    // and realWidthCm=0, producing NaN. Skip it and use Priority 2 instead.
    if (calibration) {
      // Handle both CalibrationReference and CalibrationResult shapes
      const ref = (calibration as any).reference || calibration;
      const calType = ref.type || (calibration as any).type;
      
      const explicitCmPerPixel = (calibration as any).cmPerPixel || ref.cmPerPixel;
      if (isFinite(explicitCmPerPixel) && explicitCmPerPixel > 0) {
        if (SHOULD_LOG_MEASUREMENT_ENGINE) engineLog('[MeasEngine] scaleFactor from cmPerPixel:', explicitCmPerPixel, 'type:', calType);
        return explicitCmPerPixel;
      }

      if (calType !== 'known_height') {
        const pw = ref.pixelWidth || (calibration as any).pixelWidth || 0;
        const rw = ref.realWidthCm || (calibration as any).realWidthCm || 0;
        const pixelsPerCm = pw / rw;
        const sf = 1 / pixelsPerCm; // cm per pixel
        if (SHOULD_LOG_MEASUREMENT_ENGINE) engineLog('[MeasEngine] scaleFactor from calibration:', sf, 'type:', calType);
        if (isFinite(sf) && sf > 0) {
          return sf;
        }
      }
      // Height-only or invalid calibration — fall through to known height
      if (SHOULD_LOG_MEASUREMENT_ENGINE) engineLog('[MeasEngine] calibration type:', calType, '— using knownHeight instead');
    }

    // Priority 2: Known height calibration
    if (knownHeight && knownHeight > 0) {
      const frontCapture = captures.find(c => c.type === 'front');
      if (frontCapture) {
        const headTop = this.getTopOfHead(frontCapture.landmarks);
        const feetBottom = this.getBottomOfFeet(frontCapture.landmarks);
        const heightPixels = Math.abs(feetBottom.y - headTop.y) * frontCapture.imageHeight;

        if (SHOULD_LOG_MEASUREMENT_ENGINE) {
          engineLog('[MeasEngine] headTop.y:', headTop.y, 'feetBottom.y:', feetBottom.y,
            'imgH:', frontCapture.imageHeight, 'heightPx:', heightPixels, 'knownH:', knownHeight);
        }

        if (heightPixels > 10) { // require at least 10px person height
          const sf = knownHeight / heightPixels;
          if (SHOULD_LOG_MEASUREMENT_ENGINE) engineLog('[MeasEngine] scaleFactor from knownHeight:', sf);
          return sf;
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
      if (SHOULD_LOG_MEASUREMENT_ENGINE) {
        engineLog('[MeasEngine] scaleFactor fallback: headTop.y:', headTop.y,
          'feetBottom.y:', feetBottom.y, 'heightPx:', heightPixels);
      }
      if (heightPixels > 10) {
        return 170 / heightPixels;
      }
    }

    if (SHOULD_LOG_MEASUREMENT_ENGINE) engineWarn('[MeasEngine] scaleFactor: using emergency fallback=1');
    return 1; // fallback (practically useless)
  }

  // ============================================================
  // PRIVATE: Front View Measurements
  // ============================================================

  private calculateFrontViewMeasurements(
    capture: CaptureAngle,
    scaleFactor: number,
    knownHeight?: number | null
  ) {
    const lm = capture.landmarks;
    const imgH = capture.imageHeight;
    const imgW = capture.imageWidth;

    if (SHOULD_LOG_MEASUREMENT_ENGINE) {
      engineLog('[MeasEngine] frontView: imgW:', imgW, 'imgH:', imgH,
        'landmarkCount:', lm.length, 'scaleFactor:', scaleFactor, 'knownHeight:', knownHeight);
      // Log a few key landmarks for diagnosis
      const nose = lm.find(l => l.name === 'nose');
      const lSh = lm.find(l => l.name === 'left_shoulder');
      const lAnk = lm.find(l => l.name === 'left_ankle');
      const lHeel = lm.find(l => l.name === 'left_heel');
      engineLog('[MeasEngine] keyLandmarks: nose=', nose?.y?.toFixed(4),
        'lShoulder=', lSh?.y?.toFixed(4),
        'lAnkle=', lAnk?.y?.toFixed(4),
        'lHeel=', lHeel?.y?.toFixed(4));
    }

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

    // Head top estimation: ~60% of nose-to-shoulder Y-distance above nose.
    // IMPORTANT: use Y-only distance (not Euclidean). On a portrait 3048×4064
    // phone image the Euclidean formula includes imgW in its calculation,
    // producing a headTopY that is ~10% too low and inflates the measured height
    // by 3-4× when the scale factor was derived from the Y-only formula.
    const noseToShoulderY = Math.abs(leftShoulder.y - nose.y);
    const headTopY = nose.y - noseToShoulderY * 0.6;

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

    // HEIGHT: top of head to bottom of feet.
    // When the user provided their known height, use it directly — it's more
    // accurate than the pixel-based estimate and removes any rounding errors.
    const heightPixels = (feetBottomY - headTopY) * imgH;
    const measuredHeight = this.round(heightPixels * scaleFactor);
    const height = (knownHeight && knownHeight > 0) ? knownHeight : measuredHeight;

    if (SHOULD_LOG_MEASUREMENT_ENGINE) {
      engineLog('[MeasEngine] headTopY:', headTopY.toFixed(4),
        'feetBottomY:', feetBottomY.toFixed(4), 'heightPx:', heightPixels.toFixed(1),
        'measuredH:', measuredHeight, 'finalH:', height);
    }

    // SHOULDER WIDTH: bi-deltoid width (outer edge of shoulders)
    // BlazePose landmarks sit on the acromial joint. Actual clothing bi-deltoid
    // width adds ~3-4cm of deltoid muscle on each side → ~12% wider.
    const shoulderPixels = this.distance2D(px(leftShoulder), px(rightShoulder)) * 1.12;
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

    // HALF LENGTH: shoulder to waist (approx 62% of shoulder-to-hip torso length)
    const shoulderMidY = ((leftShoulder.y + rightShoulder.y) / 2) * imgH;
    const hipMidY = ((leftHip.y + rightHip.y) / 2) * imgH;
    const torsoPixels = Math.abs(hipMidY - shoulderMidY);
    const halfLength = this.round(torsoPixels * 0.62 * scaleFactor);

    // TOP LENGTH: shoulder to hip (full garment torso length)
    const topLength = this.round(torsoPixels * scaleFactor);

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
    // UNDERBUST: same axis as chest, slightly narrower (87% of chest width)
    const underbustFrontWidth = chestFrontWidth * 0.87;

    // NECK WIDTH from front
    const neckFrontWidth = this.distance2D(px(leftShoulder), px(rightShoulder)) * 0.22;

    return {
      height,
      shoulderWidth,
      sleeveLength,
      inseam,
      halfLength,
      topLength,
      // Front widths in pixels (for circumference calc)
      frontWidths: {
        chest: chestFrontWidth * scaleFactor,
        underbust: underbustFrontWidth * scaleFactor,
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
    const nose = this.findLandmark(lm, 'nose', BLAZEPOSE_LANDMARKS.NOSE);

    // In side view, the LEFT/RIGHT landmark pairs overlap at similar x-positions.
    // The actual body depth is the *horizontal extent* of the torso in the image.
    // We estimate depth from: (a) z-coordinate differences if meaningful, or
    // (b) the horizontal span of the visible torso landmarks, or
    // (c) anthropometric depth/width ratios as final fallback.

    // Strategy A: Use the horizontal span between the most-front and most-back
    // torso landmarks visible in the side view (shoulder, hip, nose).
    const torsoLandmarks = [leftShoulder, rightShoulder, leftHip, rightHip, nose]
      .filter(l => l.visibility > 0.3);
    const xCoords = torsoLandmarks.map(l => l.x * imgW);
    const torsoSpanPx = xCoords.length >= 2
      ? Math.max(...xCoords) - Math.min(...xCoords)
      : 0;

    // Strategy B: Z-depth difference scaled by person size
    const shoulderZSpan = Math.abs(leftShoulder.z - rightShoulder.z) * imgW;
    const hipZSpan = Math.abs(leftHip.z - rightHip.z) * imgW;

    // Pick the most reliable estimate
    // The torso span in the side-view image directly represents anterior-posterior depth
    const rawChestDepth = Math.max(torsoSpanPx * 0.85, shoulderZSpan);

    // If the torso span is too small (< 5% of image), the side view detection
    // might not be giving us useful depth info — use front-width-based ratios
    const useDepthFromSide = rawChestDepth > imgW * 0.05;

    if (useDepthFromSide) {
      const chestDepth = rawChestDepth * scaleFactor;
      const waistDepth = chestDepth * 0.85;
      const hipDepth = chestDepth * 0.95;
      const neckDepth = chestDepth * 0.4;
      const thighDepth = chestDepth * 0.55;
      const calfDepth = chestDepth * 0.35;

      return {
        sideDepths: {
          chest: chestDepth,
          waist: waistDepth,
          hips: hipDepth,
          thigh: thighDepth,
          calf: calfDepth,
          neck: neckDepth,
        },
      };
    }

    // Fallback: estimate depth from front shoulder width using anthropometric ratios
    // Typical chest depth ≈ 70-80% of chest width (front)
    const frontShoulderSpan = this.distance2D(px(leftShoulder), px(rightShoulder));
    const estimatedChestDepth = frontShoulderSpan * 0.75 * scaleFactor;

    return {
      sideDepths: {
        chest: estimatedChestDepth,
        waist: estimatedChestDepth * 0.85,
        hips: estimatedChestDepth * 0.95,
        thigh: estimatedChestDepth * 0.55,
        calf: estimatedChestDepth * 0.35,
        neck: estimatedChestDepth * 0.4,
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
    warnings: string[],
    scaleFactor: number,
    contourData?: ContourData
  ): Record<string, number> {
    const frontWidths = frontMeasurements.frontWidths;
    const emptyCircumferences = (): Record<string, number> => ({
      chest: 0,
      underbust: 0,
      waist: 0,
      hips: 0,
      neck: 0,
      thigh: 0,
      calf: 0,
    });

    if (!sideMeasurements) {
      warnings.push(
        'Side view is required for circumference measurements because front view has width but no depth.'
      );
      return emptyCircumferences();
    }

    // ------------------------------------------------------------------
    // BEST: Contour (silhouette) widths from segmentation
    // These are real measured body edge-to-edge widths, not skeleton joint
    // approximations. When both front and side contours are available we
    // get an elliptical cross-section from actual measurements.
    // ------------------------------------------------------------------
    const fc = contourData?.front;
    const sc = contourData?.side;

    if (SHOULD_LOG_MEASUREMENT_ENGINE) {
      engineLog('[MeasEngine] circumferences: fc?', !!fc,
        'fc.segConf:', fc?.segmentationConfidence,
        'sc?', !!sc, 'sc.segConf:', sc?.segmentationConfidence,
        'sideMeasurements?', !!sideMeasurements);
      engineLog('[MeasEngine] frontWidths:', JSON.stringify(frontWidths));
    }

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
          const frontWidth = fw || frontWidths[part as keyof typeof frontWidths] || 0;
          const sideDepth = sw || sideMeasurements.sideDepths[part as keyof typeof sideMeasurements.sideDepths] || 0;
          if (frontWidth > 0 && sideDepth > 0) {
            result[part] = this.ellipseCircumference(frontWidth / 2, sideDepth / 2);
          } else {
            result[part] = 0;
          }
        }
        // Underbust: use skeleton frontWidth (no contour for this level) + chest depth
        const ubFW = frontWidths.underbust;
        const chestDepthSide = contourSideWidths.chest || sideMeasurements?.sideDepths.chest;
        result.underbust = ubFW > 0
          ? this.ellipseCircumference(ubFW / 2, ((chestDepthSide || ubFW) * 0.87) / 2)
          : 0;
        return result;
      }

      // GOOD: front contour only — use side skeleton depths or width→depth ratio
      if (sideMeasurements) {
        const depths = sideMeasurements.sideDepths;
        return {
          chest: this.ellipseCircumference((contourFrontWidths.chest || frontWidths.chest) / 2, depths.chest / 2),
          underbust: this.ellipseCircumference(frontWidths.underbust / 2, (depths.chest * 0.87) / 2),
          waist: this.ellipseCircumference((contourFrontWidths.waist || frontWidths.waist) / 2, depths.waist / 2),
          hips: this.ellipseCircumference((contourFrontWidths.hips || frontWidths.hips) / 2, depths.hips / 2),
          neck: this.ellipseCircumference((contourFrontWidths.neck || frontWidths.neck) / 2, depths.neck / 2),
          thigh: this.ellipseCircumference((contourFrontWidths.thigh || frontWidths.thigh) / 2, depths.thigh / 2),
          calf: this.ellipseCircumference((contourFrontWidths.calf || frontWidths.calf) / 2, depths.calf / 2),
        };
      }

      // DECENT: front contour only, no side view → estimate depth from width
      // Typical depth/width ratios from anthropometric data
      warnings.push('Side contour unavailable; using front contour width with side-view landmark depth.');
      return emptyCircumferences();
    }

    // ------------------------------------------------------------------
    // FALLBACK: Skeleton landmarks only (no contour data available)
    // ------------------------------------------------------------------
    {
      const depths = sideMeasurements.sideDepths;
      return {
        chest: this.ellipseCircumference(frontWidths.chest / 2, depths.chest / 2),
        underbust: this.ellipseCircumference(frontWidths.underbust / 2, (depths.chest * 0.87) / 2),
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
      'Add side photo to improve confidence.'
    );

    return emptyCircumferences();
  }

  private getCircumferenceSource(
    sideMeasurements: ReturnType<typeof this.calculateSideViewMeasurements> | null,
    contourData?: ContourData
  ): string {
    const hasFrontContour = !!contourData?.front && contourData.front.segmentationConfidence > 0.4;
    const hasSideContour = !!contourData?.side && contourData.side.segmentationConfidence > 0.4;
    if (!sideMeasurements) return 'withheld_missing_side_view';
    if (hasFrontContour && hasSideContour) return 'front_side_contour_ellipse';
    if (hasFrontContour) return 'front_contour_side_landmark_ellipse';
    return 'front_landmark_side_landmark_ellipse';
  }

  private getContourConfidenceByPart(contourData?: ContourData): Record<string, number> | undefined {
    if (!contourData?.front && !contourData?.side) return undefined;

    const result: Record<string, number> = {};
    const parts = new Set<string>([
      ...Object.keys(contourData.front?.widths || {}),
      ...Object.keys(contourData.side?.widths || {}),
    ]);

    for (const part of parts) {
      const values: number[] = [];
      for (const contour of [contourData.front, contourData.side]) {
        if (!contour?.widths?.[part]) continue;
        const explicit = contour.partConfidence?.[part];
        const confidence = typeof explicit === 'number'
          ? explicit
          : contour.segmentationConfidence;
        if (isFinite(confidence) && confidence > 0) {
          values.push(confidence > 1 ? confidence / 100 : confidence);
        }
      }

      if (values.length > 0) {
        const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
        result[part] = Math.max(0, Math.min(100, Math.round(avg * 100)));
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Convert contour widths from segmentation result to cm values.
   * Always uses width_px × engine scale factor (which is correctly derived
   * from landmark-based height). The server-provided width_cm uses a
   * preliminary scale factor that divides by full image height instead of
   * person height — making it ~25-30% too small — so we ignore it.
   */
  private contourWidthsToCm(
    contour: ContourWidths,
    scaleFactor: number
  ): Record<string, number> {
    // Maximum plausible body widths in cm (safety cap to prevent runaway values
    // if scaleFactor is still slightly off or segmentation bleeds into background)
    const MAX_WIDTH_CM: Record<string, number> = {
      chest: 80, waist: 80, hips: 80, neck: 30, thigh: 50, calf: 35,
    };
    const result: Record<string, number> = {};
    for (const [part, data] of Object.entries(contour.widths)) {
      if (data.width_px > 0) {
        const widthCm = data.width_px * scaleFactor;
        const cap = MAX_WIDTH_CM[part] ?? 100;
        result[part] = Math.min(widthCm, cap);
        if (SHOULD_LOG_MEASUREMENT_ENGINE && widthCm > cap) {
          engineWarn('[MeasEngine] contour width capped for', part,
            ':', widthCm.toFixed(1), '→', cap, 'cm (width_px:', data.width_px, 'sf:', scaleFactor.toFixed(5), ')');
        }
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
    if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return 0;
    const sum = a + b;
    if (sum === 0) return 0;
    const h = ((a - b) * (a - b)) / (sum * sum);
    const circumference = Math.PI * sum * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
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
      { key: 'underbust', ratioKey: 'underbustToHeight', stdDevKey: 'underbustToHeight' },
      { key: 'waist', ratioKey: 'waistToHeight', stdDevKey: 'waistToHeight' },
      { key: 'hips', ratioKey: 'hipsToHeight', stdDevKey: 'hipsToHeight' },
      { key: 'shoulders', ratioKey: 'shoulderToHeight', stdDevKey: 'shoulderToHeight' },
      { key: 'neck', ratioKey: 'neckToHeight', stdDevKey: 'neckToHeight' },
      { key: 'sleeve', ratioKey: 'sleeveToHeight', stdDevKey: 'sleeveToHeight' },
      { key: 'inseam', ratioKey: 'inseamToHeight', stdDevKey: 'inseamToHeight' },
      { key: 'thigh', ratioKey: 'thighToHeight', stdDevKey: 'thighToHeight' },
      { key: 'calf', ratioKey: 'calfToHeight', stdDevKey: 'calfToHeight' },
      { key: 'roundSleeveBicep', ratioKey: 'bicepToHeight', stdDevKey: 'bicepToHeight' },
      { key: 'roundSleeveElbow', ratioKey: 'elbowToHeight', stdDevKey: 'elbowToHeight' },
    ];

    for (const check of checks) {
      const measured = corrected[check.key];
      if (!measured || measured <= 0) continue;

      const expectedRatio = ratios[check.ratioKey];
      const actualRatio = measured / height;

      // Calculate z-score (how many standard deviations from mean)
      const stdDev = check.stdDevKey ? RATIO_STDDEV[check.stdDevKey] : 0.03;
      const zScore = Math.abs(actualRatio - expectedRatio) / stdDev;

      if (zScore > 5) {
        // Extreme outlier (>5σ): measurement is nonsensical — use expected directly
        warnings.push(
          `${check.key} measurement (${measured.toFixed(1)}cm) is wildly off (z=${zScore.toFixed(1)}). ` +
          `Review capture quality or tape-anchor this measurement.`
        );
      } else if (zScore > 3) {
        // Major outlier (3-5σ): heavy correction toward expected
        warnings.push(
          `${check.key} measurement (${measured.toFixed(1)}cm) is a statistical outlier. ` +
          `Keeping measured value and flagging for review.`
        );
      } else if (zScore > 2) {
        // Moderate outlier (2-3σ): moderate correction
        warnings.push(
          `${check.key} measurement (${measured.toFixed(1)}cm) is outside typical ratios; keeping measured value.`
        );
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
    contourData?: ContourData,
    contourConfidenceByPart?: Record<string, number>
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
      { key: 'halfLength', ratioKey: 'halfLengthToHeight', needsSideView: false, inherentDifficulty: 0.15 },
      { key: 'topLength', ratioKey: 'topLengthToHeight', needsSideView: false, inherentDifficulty: 0.15 },
      { key: 'chest', ratioKey: 'chestToHeight', needsSideView: true, inherentDifficulty: 0.2 },
      { key: 'underbust', ratioKey: 'underbustToHeight', needsSideView: true, inherentDifficulty: 0.25 },
      { key: 'waist', ratioKey: 'waistToHeight', needsSideView: true, inherentDifficulty: 0.2 },
      { key: 'hips', ratioKey: 'hipsToHeight', needsSideView: true, inherentDifficulty: 0.2 },
      { key: 'neck', ratioKey: 'neckToHeight', needsSideView: true, inherentDifficulty: 0.3 },
      { key: 'thigh', ratioKey: 'thighToHeight', needsSideView: true, inherentDifficulty: 0.3 },
      { key: 'calf', ratioKey: 'calfToHeight', needsSideView: true, inherentDifficulty: 0.35 },
      { key: 'roundSleeveBicep', ratioKey: 'bicepToHeight', needsSideView: false, inherentDifficulty: 0.35 },
      { key: 'roundSleeveElbow', ratioKey: 'elbowToHeight', needsSideView: false, inherentDifficulty: 0.35 },
    ];

    for (const config of measurementConfigs) {
      if (!(config.key in measurements)) {
        continue;
      }

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

        const contourPartKey = config.key === 'underbust' ? 'chest' : config.key;
        const partConfidence = contourConfidenceByPart?.[contourPartKey];
        if (partConfidence !== undefined) {
          if (partConfidence >= 75) {
            logOdds += Math.log(1.6);
          } else if (partConfidence >= 50) {
            logOdds += Math.log(1.15);
          } else {
            logOdds += Math.log(0.7);
          }
        }
      }

      // Anthropometric plausibility (measurements close to expected are more trustworthy)
      const measValue = measurements[config.key];
      if (!isFinite(measValue) || measValue <= 0) {
        // Missing or invalid measurement → low confidence
        confidence[config.key] = 0;
        continue;
      } else if (config.ratioKey && measValue > 0) {
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

    // High-quality captures (0.9+) deserve a strong base; 0.85 weight keeps the
    // Bayesian posterior from starting too low.
    return Math.round(avgConfidence * 100 * 0.85);
  }

  private calculateOverallAccuracy(
    confidence: Record<string, number>,
    captures: CaptureAngle[]
  ): number {
    const values = Object.values(confidence);
    if (values.length === 0) return 0;

    // Arithmetic mean of per-measurement confidence — the Bayesian model already
    // accounts for data quality, so a simple average gives an honest overall score.
    const mean = values.reduce((sum, c) => sum + c, 0) / values.length;

    // Bonus for multi-angle capture (more data = less ambiguity)
    const angleBonus = Math.min(8, (captures.length - 1) * 4);

    return Math.min(98, Math.round(mean + angleBonus));
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
    if (!isFinite(value)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Sanitize a measurements record: replace NaN/Infinity/negative with 0.
   */
  private sanitizeMeasurements(m: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      result[k] = (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
    }
    return result;
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
   * Uses ISO 8559-1 absolute ranges (XS–XXL) and anatomical proportion rules.
   */
  private applyCrossMeasurementValidation(
    measurements: Record<string, number>,
    gender: 'male' | 'female' | 'other',
    warnings: string[]
  ): Record<string, number> {
    const m = { ...measurements };
    return this.applyPlausibilityWarnings(m, gender, warnings);
  }

  private applyPlausibilityWarnings(
    measurements: Record<string, number>,
    gender: 'male' | 'female' | 'other',
    warnings: string[]
  ): Record<string, number> {
    const m = { ...measurements };
    return this.collectPlausibilityWarnings(m, gender, warnings);
  }

  private collectPlausibilityWarnings(
    measurements: Record<string, number>,
    gender: 'male' | 'female' | 'other',
    warnings: string[]
  ): Record<string, number> {
    const m = measurements;
    const typicalRanges: Record<string, Record<string, { min: number; max: number }>> = {
      male: {
        chest: { min: 88, max: 120 },
        waist: { min: 72, max: 108 },
        hips: { min: 88, max: 116 },
        shoulders: { min: 41, max: 51 },
        neck: { min: 36, max: 44 },
        sleeve: { min: 58, max: 68 },
        inseam: { min: 76, max: 86 },
        thigh: { min: 54, max: 68 },
        calf: { min: 35, max: 44 },
      },
      female: {
        chest: { min: 80, max: 116 },
        underbust: { min: 64, max: 92 },
        waist: { min: 60, max: 98 },
        hips: { min: 86, max: 122 },
        shoulders: { min: 34, max: 44 },
        neck: { min: 33, max: 39 },
        sleeve: { min: 57, max: 63 },
        inseam: { min: 73, max: 83 },
        thigh: { min: 48, max: 66 },
        calf: { min: 30, max: 40 },
      },
      other: {
        chest: { min: 80, max: 120 },
        waist: { min: 60, max: 108 },
        hips: { min: 86, max: 122 },
        shoulders: { min: 34, max: 51 },
        neck: { min: 33, max: 44 },
        sleeve: { min: 57, max: 68 },
        inseam: { min: 73, max: 86 },
        thigh: { min: 48, max: 68 },
        calf: { min: 30, max: 44 },
      },
    };

    const activeTypicalRanges = typicalRanges[gender] || typicalRanges.other;
    for (const [key, bounds] of Object.entries(activeTypicalRanges)) {
      const value = m[key];
      if (!value || value <= 0) continue;
      const min = bounds.min * 0.9;
      const max = bounds.max * 1.1;
      if (value > max) {
        warnings.push(`${key} (${this.round(value)}cm) exceeds typical range ${max.toFixed(0)}cm; keeping measured value.`);
      } else if (value < min) {
        warnings.push(`${key} (${this.round(value)}cm) is below typical range ${min.toFixed(0)}cm; keeping measured value.`);
      }
    }

    if (m.hips > 0 && m.waist > 0 && m.waist > m.hips * 1.15) {
      warnings.push('Waist exceeds hips by more than 15%; keeping measured values and flagging for review.');
    }
    if (m.chest > 0 && m.neck > 0 && m.neck > m.chest * 0.6) {
      warnings.push('Neck circumference is close to chest; keeping measured value and flagging for review.');
    }
    if (m.thigh > 0 && m.hips > 0 && m.thigh > m.hips * 0.75) {
      warnings.push('Thigh circumference is high relative to hips; keeping measured value and flagging for review.');
    }
    if (m.calf > 0 && m.thigh > 0 && m.calf > m.thigh) {
      warnings.push('Calf circumference exceeds thigh; keeping measured value and flagging for review.');
    }
    if (m.shoulders > 0 && m.height > 0) {
      const ratios = this.getActiveRatios(gender);
      const expectedShoulder = m.height * ratios.shoulderToHeight;
      if (m.shoulders > expectedShoulder * 1.35 || m.shoulders < expectedShoulder * 0.7) {
        warnings.push('Shoulder width is outside typical ratios; keeping measured value.');
      }
    }
    if (m.sleeve > 0 && m.height > 0) {
      const sleeveRatio = m.sleeve / m.height;
      if (sleeveRatio > 0.45 || sleeveRatio < 0.25) {
        warnings.push('Sleeve length is outside typical height ratios; keeping measured value.');
      }
    }
    if (m.inseam > 0 && m.height > 0) {
      const inseamRatio = m.inseam / m.height;
      if (inseamRatio > 0.55 || inseamRatio < 0.35) {
        warnings.push('Inseam is outside typical height ratios; keeping measured value.');
      }
    }
    return m;

    // ── ISO 8559-1 absolute ranges (XS–XXL) ──
    const isoRanges: Record<string, Record<string, { min: number; max: number }>> = {
      male: {
        chest:     { min: 88, max: 120 },
        waist:     { min: 72, max: 108 },
        hips:      { min: 88, max: 116 },
        shoulders: { min: 41, max: 51 },
        neck:      { min: 36, max: 44 },
        sleeve:    { min: 58, max: 68 },
        inseam:    { min: 76, max: 86 },
        thigh:     { min: 54, max: 68 },
        calf:      { min: 35, max: 44 },
        bicep:     { min: 30, max: 40 },
      },
      female: {
        chest:     { min: 80, max: 116 },
        underbust: { min: 64, max: 92 },
        waist:     { min: 60, max: 98 },
        hips:      { min: 86, max: 122 },
        shoulders: { min: 34, max: 44 },
        neck:      { min: 33, max: 39 },
        sleeve:    { min: 57, max: 63 },
        inseam:    { min: 73, max: 83 },
        thigh:     { min: 48, max: 66 },
        calf:      { min: 30, max: 40 },
        bicep:     { min: 26, max: 36 },
      },
      other: {
        chest:     { min: 80, max: 120 },
        waist:     { min: 60, max: 108 },
        hips:      { min: 86, max: 122 },
        shoulders: { min: 34, max: 51 },
        neck:      { min: 33, max: 44 },
        sleeve:    { min: 57, max: 68 },
        inseam:    { min: 73, max: 86 },
        thigh:     { min: 48, max: 68 },
        calf:      { min: 30, max: 44 },
        bicep:     { min: 26, max: 40 },
      },
    };

    // Legacy absolute-range notes; runtime validation above is warning-only.
    const ranges = isoRanges[gender] || isoRanges.other;
    for (const [key, bounds] of Object.entries(ranges)) {
      if (m[key] > 0) {
        const marginMin = bounds.min * 0.90; // 10% below XS
        const marginMax = bounds.max * 1.10; // 10% above XXL
        if (m[key] > marginMax) {
          warnings.push(`${key} (${this.round(m[key])}cm) exceeds ISO max ${marginMax.toFixed(0)}cm; keeping measured value.`);
        } else if (m[key] < marginMin) {
          warnings.push(`${key} (${this.round(m[key])}cm) below ISO min ${marginMin.toFixed(0)}cm; keeping measured value.`);
        }
      }
    }

    // Rule 1: Hips should generally be >= waist (in most body types)
    if (m.hips > 0 && m.waist > 0 && m.waist > m.hips * 1.15) {
      warnings.push('Waist exceeds hips by >15%; keeping measured values and flagging for review.');
    }

    // Rule 2: Chest should be > neck
    if (m.chest > 0 && m.neck > 0 && m.neck > m.chest * 0.6) {
      warnings.push('Neck circumference too close to chest; keeping measured value and flagging for review.');
    }

    // Rule 3: Thigh should be < hips
    if (m.thigh > 0 && m.hips > 0 && m.thigh > m.hips * 0.75) {
    }

    // Rule 4: Calf should be < thigh
    if (m.calf > 0 && m.thigh > 0 && m.calf > m.thigh) {
    }

    // Rule 5: Shoulder width should be reasonable relative to height
    if (m.shoulders > 0 && m.height > 0) {
      const ratios = this.getActiveRatios(gender);
      const expectedShoulder = m.height * ratios.shoulderToHeight;
      if (m.shoulders > expectedShoulder * 1.35 || m.shoulders < expectedShoulder * 0.7) {
        warnings.push('Shoulder width outside expected range; keeping measured value.');
      }
    }

    // Rule 6: Sleeve should be reasonable relative to height
    if (m.sleeve > 0 && m.height > 0) {
      const sleeveRatio = m.sleeve / m.height;
      if (sleeveRatio > 0.45 || sleeveRatio < 0.25) {
      }
    }

    // Rule 7: Inseam should be reasonable relative to height
    if (m.inseam > 0 && m.height > 0) {
      const inseamRatio = m.inseam / m.height;
      if (inseamRatio > 0.55 || inseamRatio < 0.35) {
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
        'anthropometric_plausibility_warnings',
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
        withContourAndMultiAngle: 'highest confidence; validation required',
        withCalibrationAndMultiAngle: 'high confidence; validation required',
        withCalibrationFrontOnly: 'moderate confidence; validation required',
        withoutCalibration: 'estimate only; validation required',
      },
    };
  }
}

export const measurementEngine = new MeasurementEngine();
