/**
 * Reference Calibration Service Tests
 */

import { referenceCalibrationService } from '../../services/referenceCalibration';
import { REFERENCE_SIZES } from '../../services/measurementEngine';

describe('ReferenceCalibrationService', () => {
  describe('createCalibration', () => {
    it('should calculate correct pixels-per-cm for credit card', () => {
      // Credit card: 8.56cm × 5.398cm
      // If detected at 171.2 × 107.96 pixels → 20 px/cm
      const result = referenceCalibrationService.createCalibration(
        'credit_card',
        171.2,
        107.96
      );

      expect(result.pixelsPerCm).toBeCloseTo(20, 0);
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.reference.type).toBe('credit_card');
      expect(result.reference.realWidthCm).toBe(REFERENCE_SIZES.credit_card.width);
      expect(result.reference.realHeightCm).toBe(REFERENCE_SIZES.credit_card.height);
    });

    it('should reduce confidence for bad aspect ratio', () => {
      // Deliberately wrong aspect ratio (stretched in one dimension)
      const good = referenceCalibrationService.createCalibration(
        'credit_card',
        171.2,
        107.96 // correct proportions
      );

      const bad = referenceCalibrationService.createCalibration(
        'credit_card',
        171.2,
        60 // distorted
      );

      expect(bad.confidence).toBeLessThan(good.confidence);
    });

    it('should work for A4 paper', () => {
      const result = referenceCalibrationService.createCalibration(
        'a4_paper',
        420,
        594
      );

      expect(result.pixelsPerCm).toBeCloseTo(20, 0);
      expect(result.reference.type).toBe('a4_paper');
    });

    it('should work for ruler', () => {
      const result = referenceCalibrationService.createCalibration(
        'ruler',
        600,
        60
      );

      expect(result.pixelsPerCm).toBeCloseTo(20, 0);
      expect(result.reference.type).toBe('ruler');
    });

    it('should estimate camera distance', () => {
      const result = referenceCalibrationService.createCalibration(
        'credit_card',
        171.2,
        107.96
      );

      expect(result.distanceEstimateCm).toBeGreaterThan(0);
    });
  });

  describe('createHeightCalibration', () => {
    it('should calculate from known height', () => {
      const result = referenceCalibrationService.createHeightCalibration(
        175, // 175cm tall
        875  // 875 pixels in image
      );

      expect(result.pixelsPerCm).toBeCloseTo(5, 1);
      expect(result.confidence).toBe(0.85);
      expect(result.reference.type).toBe('known_height');
      expect(result.reference.realHeightCm).toBe(175);
    });
  });

  describe('validateCalibration', () => {
    it('should validate consistent readings', () => {
      const readings = [
        referenceCalibrationService.createCalibration('credit_card', 171, 108),
        referenceCalibrationService.createCalibration('credit_card', 172, 108.5),
        referenceCalibrationService.createCalibration('credit_card', 170.5, 107.5),
      ];

      const validation = referenceCalibrationService.validateCalibration(readings);

      expect(validation.isConsistent).toBe(true);
      expect(validation.stdDev).toBeLessThan(1);
    });

    it('should flag inconsistent readings', () => {
      const readings = [
        referenceCalibrationService.createCalibration('credit_card', 171, 108),
        referenceCalibrationService.createCalibration('credit_card', 300, 190), // very different
        referenceCalibrationService.createCalibration('credit_card', 170, 107),
      ];

      const validation = referenceCalibrationService.validateCalibration(readings);

      expect(validation.isConsistent).toBe(false);
    });

    it('should handle single reading', () => {
      const readings = [
        referenceCalibrationService.createCalibration('credit_card', 171, 108),
      ];

      const validation = referenceCalibrationService.validateCalibration(readings);

      expect(validation.isConsistent).toBe(true);
      expect(validation.stdDev).toBe(0);
    });
  });

  describe('getCalibrationGuide', () => {
    it('should return guide for credit card', () => {
      const guide = referenceCalibrationService.getCalibrationGuide('credit_card');

      expect(guide.referenceType).toBe('credit_card');
      expect(guide.instructions.length).toBeGreaterThan(0);
      expect(guide.tips.length).toBeGreaterThan(0);
      expect(guide.badExamples.length).toBeGreaterThan(0);
    });

    it('should return guide for A4 paper', () => {
      const guide = referenceCalibrationService.getCalibrationGuide('a4_paper');

      expect(guide.referenceType).toBe('a4_paper');
      expect(guide.instructions.length).toBeGreaterThan(0);
    });

    it('should return guide for ruler', () => {
      const guide = referenceCalibrationService.getCalibrationGuide('ruler');

      expect(guide.referenceType).toBe('ruler');
    });
  });

  describe('detectReferenceObject', () => {
    it('should return not detected (placeholder)', async () => {
      const result = await referenceCalibrationService.detectReferenceObject(
        'file:///test/image.jpg'
      );

      expect(result.detected).toBe(false);
      expect(result.type).toBeNull();
      expect(result.bounds).toBeNull();
    });
  });
});
