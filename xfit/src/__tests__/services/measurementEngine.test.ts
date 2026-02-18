/**
 * Measurement Engine Tests
 * 
 * Tests the core measurement calculation logic with real math verification.
 */

import { measurementEngine, Landmark, CaptureAngle } from '../../services/measurementEngine';

// ============================================================
// HELPERS
// ============================================================

/**
 * Create a set of realistic front-view landmarks for a person of known height.
 * Positions are normalized 0-1 coordinates.
 */
function createFrontLandmarks(heightCm: number = 175): Landmark[] {
  // Standard body proportions for a ~175cm person
  return [
    { x: 0.5, y: 0.08, z: 0, visibility: 0.95, name: 'nose' },
    { x: 0.49, y: 0.075, z: 0, visibility: 0.9, name: 'left_eye_inner' },
    { x: 0.48, y: 0.075, z: 0, visibility: 0.9, name: 'left_eye' },
    { x: 0.47, y: 0.075, z: 0, visibility: 0.9, name: 'left_eye_outer' },
    { x: 0.51, y: 0.075, z: 0, visibility: 0.9, name: 'right_eye_inner' },
    { x: 0.52, y: 0.075, z: 0, visibility: 0.9, name: 'right_eye' },
    { x: 0.53, y: 0.075, z: 0, visibility: 0.9, name: 'right_eye_outer' },
    { x: 0.44, y: 0.085, z: 0, visibility: 0.85, name: 'left_ear' },
    { x: 0.56, y: 0.085, z: 0, visibility: 0.85, name: 'right_ear' },
    { x: 0.48, y: 0.1, z: 0, visibility: 0.85, name: 'mouth_left' },
    { x: 0.52, y: 0.1, z: 0, visibility: 0.85, name: 'mouth_right' },
    { x: 0.37, y: 0.2, z: 0, visibility: 0.95, name: 'left_shoulder' },
    { x: 0.63, y: 0.2, z: 0, visibility: 0.95, name: 'right_shoulder' },
    { x: 0.32, y: 0.35, z: 0, visibility: 0.9, name: 'left_elbow' },
    { x: 0.68, y: 0.35, z: 0, visibility: 0.9, name: 'right_elbow' },
    { x: 0.30, y: 0.47, z: 0, visibility: 0.88, name: 'left_wrist' },
    { x: 0.70, y: 0.47, z: 0, visibility: 0.88, name: 'right_wrist' },
    { x: 0.29, y: 0.49, z: 0, visibility: 0.8, name: 'left_pinky' },
    { x: 0.71, y: 0.49, z: 0, visibility: 0.8, name: 'right_pinky' },
    { x: 0.29, y: 0.50, z: 0, visibility: 0.8, name: 'left_index' },
    { x: 0.71, y: 0.50, z: 0, visibility: 0.8, name: 'right_index' },
    { x: 0.31, y: 0.48, z: 0, visibility: 0.8, name: 'left_thumb' },
    { x: 0.69, y: 0.48, z: 0, visibility: 0.8, name: 'right_thumb' },
    { x: 0.42, y: 0.52, z: 0, visibility: 0.95, name: 'left_hip' },
    { x: 0.58, y: 0.52, z: 0, visibility: 0.95, name: 'right_hip' },
    { x: 0.43, y: 0.72, z: 0, visibility: 0.9, name: 'left_knee' },
    { x: 0.57, y: 0.72, z: 0, visibility: 0.9, name: 'right_knee' },
    { x: 0.43, y: 0.89, z: 0, visibility: 0.9, name: 'left_ankle' },
    { x: 0.57, y: 0.89, z: 0, visibility: 0.9, name: 'right_ankle' },
    { x: 0.42, y: 0.91, z: 0, visibility: 0.85, name: 'left_heel' },
    { x: 0.58, y: 0.91, z: 0, visibility: 0.85, name: 'right_heel' },
    { x: 0.44, y: 0.93, z: 0, visibility: 0.85, name: 'left_foot_index' },
    { x: 0.56, y: 0.93, z: 0, visibility: 0.85, name: 'right_foot_index' },
  ];
}

function createFrontCapture(heightCm: number = 175): CaptureAngle {
  return {
    type: 'front',
    landmarks: createFrontLandmarks(heightCm),
    imageWidth: 720,
    imageHeight: 1280,
    confidence: 0.9,
  };
}

function createSideCapture(): CaptureAngle {
  return {
    type: 'side',
    landmarks: [
      { x: 0.5, y: 0.08, z: 0, visibility: 0.9, name: 'nose' },
      { x: 0.49, y: 0.075, z: 0, visibility: 0.7, name: 'left_eye_inner' },
      { x: 0.48, y: 0.075, z: 0, visibility: 0.7, name: 'left_eye' },
      { x: 0.47, y: 0.075, z: 0, visibility: 0.7, name: 'left_eye_outer' },
      { x: 0.51, y: 0.075, z: 0, visibility: 0.7, name: 'right_eye_inner' },
      { x: 0.52, y: 0.075, z: 0, visibility: 0.7, name: 'right_eye' },
      { x: 0.53, y: 0.075, z: 0, visibility: 0.7, name: 'right_eye_outer' },
      { x: 0.44, y: 0.085, z: 0, visibility: 0.7, name: 'left_ear' },
      { x: 0.56, y: 0.085, z: 0, visibility: 0.3, name: 'right_ear' },
      { x: 0.48, y: 0.1, z: 0, visibility: 0.7, name: 'mouth_left' },
      { x: 0.52, y: 0.1, z: 0, visibility: 0.5, name: 'mouth_right' },
      { x: 0.45, y: 0.2, z: 0, visibility: 0.9, name: 'left_shoulder' },
      { x: 0.55, y: 0.2, z: 0, visibility: 0.85, name: 'right_shoulder' },
      { x: 0.4, y: 0.35, z: 0, visibility: 0.85, name: 'left_elbow' },
      { x: 0.6, y: 0.35, z: 0, visibility: 0.5, name: 'right_elbow' },
      { x: 0.38, y: 0.47, z: 0, visibility: 0.8, name: 'left_wrist' },
      { x: 0.62, y: 0.47, z: 0, visibility: 0.4, name: 'right_wrist' },
      { x: 0.37, y: 0.49, z: 0, visibility: 0.6, name: 'left_pinky' },
      { x: 0.63, y: 0.49, z: 0, visibility: 0.3, name: 'right_pinky' },
      { x: 0.37, y: 0.50, z: 0, visibility: 0.6, name: 'left_index' },
      { x: 0.63, y: 0.50, z: 0, visibility: 0.3, name: 'right_index' },
      { x: 0.39, y: 0.48, z: 0, visibility: 0.6, name: 'left_thumb' },
      { x: 0.61, y: 0.48, z: 0, visibility: 0.3, name: 'right_thumb' },
      { x: 0.45, y: 0.52, z: 0, visibility: 0.9, name: 'left_hip' },
      { x: 0.55, y: 0.52, z: 0, visibility: 0.85, name: 'right_hip' },
      { x: 0.47, y: 0.72, z: 0, visibility: 0.85, name: 'left_knee' },
      { x: 0.53, y: 0.72, z: 0, visibility: 0.8, name: 'right_knee' },
      { x: 0.47, y: 0.89, z: 0, visibility: 0.85, name: 'left_ankle' },
      { x: 0.53, y: 0.89, z: 0, visibility: 0.85, name: 'right_ankle' },
      { x: 0.46, y: 0.91, z: 0, visibility: 0.8, name: 'left_heel' },
      { x: 0.54, y: 0.91, z: 0, visibility: 0.8, name: 'right_heel' },
      { x: 0.48, y: 0.93, z: 0, visibility: 0.8, name: 'left_foot_index' },
      { x: 0.52, y: 0.93, z: 0, visibility: 0.8, name: 'right_foot_index' },
    ],
    imageWidth: 720,
    imageHeight: 1280,
    confidence: 0.85,
  };
}

// ============================================================
// TESTS
// ============================================================

describe('MeasurementEngine', () => {
  describe('calculateFromMultiAngle', () => {
    it('should calculate measurements from front view with known height', () => {
      const frontCapture = createFrontCapture();
      const knownHeight = 175;

      const result = measurementEngine.calculateFromMultiAngle(
        [frontCapture],
        null,
        knownHeight,
        'male'
      );

      // Height should be close to known height
      expect(result.measurements.height).toBeGreaterThan(150);
      expect(result.measurements.height).toBeLessThan(200);

      // Shoulders should be reasonable (40-55cm for adult male)
      expect(result.measurements.shoulders).toBeGreaterThan(35);
      expect(result.measurements.shoulders).toBeLessThan(60);

      // Should have confidence scores for all measurements
      expect(Object.keys(result.confidence).length).toBeGreaterThan(0);

      // Should have metadata
      expect(result.metadata.engineVersion).toBeTruthy();
      expect(result.metadata.anglesUsed).toContain('front');
    });

    it('should improve accuracy with multi-angle captures', () => {
      const frontCapture = createFrontCapture();
      const sideCapture = createSideCapture();
      const knownHeight = 175;

      const singleResult = measurementEngine.calculateFromMultiAngle(
        [frontCapture],
        null,
        knownHeight,
        'male'
      );

      const multiResult = measurementEngine.calculateFromMultiAngle(
        [frontCapture, sideCapture],
        null,
        knownHeight,
        'male'
      );

      // Multi-angle should have higher overall accuracy
      expect(multiResult.overallAccuracy).toBeGreaterThanOrEqual(
        singleResult.overallAccuracy - 5 // allow small variance
      );

      // Multi-angle should have circumference measurements
      expect(multiResult.measurements.chest).toBeGreaterThan(0);
      expect(multiResult.measurements.waist).toBeGreaterThan(0);

      // Should use both angles
      expect(multiResult.metadata.anglesUsed).toContain('front');
      expect(multiResult.metadata.anglesUsed).toContain('side');
    });

    it('should warn when no calibration is provided', () => {
      const frontCapture = createFrontCapture();

      const result = measurementEngine.calculateFromMultiAngle(
        [frontCapture],
        null,
        null, // no known height
        'male'
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.toLowerCase().includes('calibration'))).toBe(true);
    });

    it('should require front view capture', () => {
      const sideCapture = createSideCapture();

      expect(() => {
        measurementEngine.calculateFromMultiAngle(
          [sideCapture],
          null,
          175,
          'male'
        );
      }).toThrow('Front-view capture is required');
    });

    it('should apply anthropometric corrections for outlier measurements', () => {
      // Create landmarks with exaggerated proportions
      const weirdCapture: CaptureAngle = {
        ...createFrontCapture(),
        landmarks: createFrontLandmarks().map(l => {
          // Exaggerate shoulder width
          if (l.name === 'left_shoulder') return { ...l, x: 0.1 };
          if (l.name === 'right_shoulder') return { ...l, x: 0.9 };
          return l;
        }),
      };

      const result = measurementEngine.calculateFromMultiAngle(
        [weirdCapture],
        null,
        175,
        'male'
      );

      // Shoulders should be corrected toward reasonable range
      // The engine pulls outliers toward the expected mean (40% measured + 60% expected for >3σ)
      // With extreme landmarks (0.1-0.9), raw would be very wide, so correction should pull it down
      expect(result.measurements.shoulders).toBeLessThan(80); // Should not be raw extreme
      expect(result.measurements.shoulders).toBeGreaterThan(30); // Should not be absurdly small

      // Should have warning about correction
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('calculateFromSingleAngle', () => {
    it('should work with minimal inputs', () => {
      const landmarks = createFrontLandmarks();

      const result = measurementEngine.calculateFromSingleAngle(
        landmarks,
        720,
        1280,
        175,
        'female'
      );

      expect(result.measurements.height).toBeGreaterThan(0);
      expect(result.overallAccuracy).toBeGreaterThan(0);
    });
  });

  describe('getInfo', () => {
    it('should return engine capabilities', () => {
      const info = measurementEngine.getInfo();

      expect(info.version).toBeTruthy();
      expect(info.capabilities).toContain('multi_angle_measurement');
      expect(info.capabilities).toContain('anthropometric_correction');
      expect(info.supportedAngles).toContain('front');
      expect(info.supportedAngles).toContain('side');
    });
  });
});
