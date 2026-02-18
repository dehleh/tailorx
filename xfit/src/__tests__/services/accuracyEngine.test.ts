/**
 * Accuracy Engine Tests
 */

import { accuracyEngine } from '../../services/accuracyEngine';
import { MeasurementResult } from '../../services/measurementEngine';

function createMockResult(overrides?: Partial<MeasurementResult>): MeasurementResult {
  return {
    measurements: {
      height: 175,
      shoulders: 45,
      chest: 95,
      waist: 80,
      hips: 98,
      neck: 38,
      sleeve: 62,
      inseam: 80,
      thigh: 55,
      calf: 37,
    },
    confidence: {
      height: 90,
      shoulders: 85,
      chest: 80,
      waist: 78,
      hips: 82,
      neck: 75,
      sleeve: 83,
      inseam: 79,
      thigh: 72,
      calf: 68,
    },
    overallAccuracy: 82,
    warnings: [],
    metadata: {
      anglesUsed: ['front'],
      calibrationMethod: 'known_height',
      processingTimeMs: 150,
      engineVersion: '2.0.0-production',
    },
    ...overrides,
  };
}

describe('AccuracyEngine', () => {
  describe('analyzeAccuracy', () => {
    it('should provide accuracy report with recommendations', () => {
      const result = createMockResult();
      const report = accuracyEngine.analyzeAccuracy(result);

      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.perMeasurement).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should recommend side view if not provided', () => {
      const result = createMockResult({
        metadata: {
          anglesUsed: ['front'],
          calibrationMethod: 'known_height',
          processingTimeMs: 150,
          engineVersion: '2.0.0',
        },
      });

      const report = accuracyEngine.analyzeAccuracy(result);

      expect(
        report.recommendations.some(r => r.toLowerCase().includes('side'))
      ).toBe(true);
    });

    it('should recommend calibration if not provided', () => {
      const result = createMockResult({
        metadata: {
          anglesUsed: ['front'],
          calibrationMethod: 'estimated',
          processingTimeMs: 150,
          engineVersion: '2.0.0',
        },
      });

      const report = accuracyEngine.analyzeAccuracy(result);

      expect(
        report.recommendations.some(r => 
          r.toLowerCase().includes('reference') || r.toLowerCase().includes('calibration')
        )
      ).toBe(true);
    });

    it('should show improvement potential', () => {
      const result = createMockResult({
        metadata: {
          anglesUsed: ['front'],
          calibrationMethod: 'estimated',
          processingTimeMs: 150,
          engineVersion: '2.0.0',
        },
      });

      const report = accuracyEngine.analyzeAccuracy(result);

      expect(report.improvementPotential.withCalibration).toBeGreaterThan(
        report.overallScore
      );
      expect(report.improvementPotential.withSideView).toBeGreaterThan(
        report.overallScore
      );
    });
  });

  describe('ensembleAverage', () => {
    it('should average multiple scan results', () => {
      const results = [
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 94 } }),
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 96 } }),
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 95 } }),
      ];

      const ensemble = accuracyEngine.ensembleAverage(results);

      expect(ensemble.measurements.chest).toBeCloseTo(95, 0);
      expect(ensemble.scansUsed).toBe(3);
      expect(ensemble.confidence.chest).toBeGreaterThan(
        results[0].confidence.chest
      );
    });

    it('should remove outliers', () => {
      const results = [
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 95 } }),
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 96 } }),
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 94 } }),
        createMockResult({ measurements: { ...createMockResult().measurements, chest: 150 } }), // outlier
      ];

      const ensemble = accuracyEngine.ensembleAverage(results);

      // Should not be heavily influenced by the outlier
      expect(ensemble.measurements.chest).toBeLessThan(110);
    });

    it('should throw on empty results', () => {
      expect(() => accuracyEngine.ensembleAverage([])).toThrow();
    });

    it('should handle single result', () => {
      const result = createMockResult();
      const ensemble = accuracyEngine.ensembleAverage([result]);

      expect(ensemble.measurements).toEqual(result.measurements);
      expect(ensemble.scansUsed).toBe(1);
    });
  });

  describe('detectOutlier', () => {
    it('should detect when new measurement is an outlier', () => {
      const history = [
        {
          id: '1', userId: 'u1', date: new Date(), unit: 'cm' as const,
          measurements: { height: 175, weight: 70, chest: 95, waist: 80, hips: 98, shoulders: 45, neck: 38, sleeve: 62, inseam: 80, thigh: 55, calf: 37 },
        },
        {
          id: '2', userId: 'u1', date: new Date(), unit: 'cm' as const,
          measurements: { height: 175, weight: 70, chest: 96, waist: 81, hips: 97, shoulders: 45, neck: 38, sleeve: 62, inseam: 80, thigh: 55, calf: 37 },
        },
        {
          id: '3', userId: 'u1', date: new Date(), unit: 'cm' as const,
          measurements: { height: 175, weight: 70, chest: 94, waist: 79, hips: 98, shoulders: 44, neck: 38, sleeve: 62, inseam: 80, thigh: 55, calf: 37 },
        },
      ];

      const outlierMeasurement = {
        height: 175,
        chest: 140, // extreme outlier
        waist: 80,
      };

      const result = accuracyEngine.detectOutlier(outlierMeasurement, history);

      expect(result.isOutlier).toBe(true);
      expect(result.outlierKeys).toContain('chest');
    });

    it('should not flag consistent measurements', () => {
      const history = [
        {
          id: '1', userId: 'u1', date: new Date(), unit: 'cm' as const,
          measurements: { height: 175, weight: 70, chest: 95, waist: 80, hips: 98, shoulders: 45, neck: 38, sleeve: 62, inseam: 80, thigh: 55, calf: 37 },
        },
        {
          id: '2', userId: 'u1', date: new Date(), unit: 'cm' as const,
          measurements: { height: 175, weight: 70, chest: 96, waist: 81, hips: 97, shoulders: 45, neck: 38, sleeve: 62, inseam: 80, thigh: 55, calf: 37 },
        },
        {
          id: '3', userId: 'u1', date: new Date(), unit: 'cm' as const,
          measurements: { height: 175, weight: 70, chest: 94, waist: 79, hips: 98, shoulders: 44, neck: 38, sleeve: 62, inseam: 80, thigh: 55, calf: 37 },
        },
      ];

      const normalMeasurement = {
        height: 175,
        chest: 95.5,
        waist: 80,
      };

      const result = accuracyEngine.detectOutlier(normalMeasurement, history);

      expect(result.isOutlier).toBe(false);
    });
  });

  describe('getExpectedAccuracy', () => {
    it('should return better accuracy with calibration', () => {
      const withoutCal = accuracyEngine.getExpectedAccuracy({
        hasCalibration: false,
        hasSideView: false,
        hasBackView: false,
        landmarkConfidence: 0.9,
        lightingQuality: 'good',
      });

      const withCal = accuracyEngine.getExpectedAccuracy({
        hasCalibration: true,
        hasSideView: false,
        hasBackView: false,
        landmarkConfidence: 0.9,
        lightingQuality: 'good',
      });

      // Parse error values
      const withoutError = parseFloat(withoutCal.linearMeasurements.replace('±', '').replace('cm', ''));
      const withError = parseFloat(withCal.linearMeasurements.replace('±', '').replace('cm', ''));

      expect(withError).toBeLessThan(withoutError);
    });
  });
});
