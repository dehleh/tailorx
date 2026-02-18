/**
 * Production Image Validation Service Tests
 */

import { productionImageValidation } from '../../services/productionImageValidation';

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 500000 }),
}));

// Mock RN Image
jest.mock('react-native', () => ({
  Image: {
    getSize: jest.fn((_uri: string, success: (w: number, h: number) => void) => {
      success(1080, 1920);
    }),
  },
}));

describe('ProductionImageValidationService', () => {
  describe('validate', () => {
    it('should validate a good image', async () => {
      const result = await productionImageValidation.validate('file:///good-image.jpg');

      expect(result.isValid).toBe(true);
      expect(result.overallScore).toBeGreaterThan(60);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.canProceedWithWarnings).toBe(true);
    });

    it('should reject inaccessible files', async () => {
      const FileSystem = require('expo-file-system');
      FileSystem.getInfoAsync.mockResolvedValueOnce({ exists: false });

      const result = await productionImageValidation.validate('file:///missing.jpg');

      expect(result.isValid).toBe(false);
      expect(result.overallScore).toBe(0);
      expect(result.canProceedWithWarnings).toBe(false);
    });

    it('should produce recommendations for issues', async () => {
      const result = await productionImageValidation.validate('file:///test.jpg');

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should check multiple quality aspects', async () => {
      const result = await productionImageValidation.validate('file:///test.jpg');

      const checkTypes = result.checks.map(c => c.type);
      // Should check resolution, file size, aspect ratio, and quality
      expect(result.checks.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('quickValidate', () => {
    it('should accept good dimensions', () => {
      const result = productionImageValidation.quickValidate(720, 1280);

      expect(result.isAcceptable).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should reject too-low resolution', () => {
      const result = productionImageValidation.quickValidate(320, 240);

      expect(result.isAcceptable).toBe(false);
      expect(result.issues.some(i => i.toLowerCase().includes('resolution'))).toBe(true);
    });

    it('should flag landscape orientation', () => {
      const result = productionImageValidation.quickValidate(1920, 1080);

      expect(result.isAcceptable).toBe(false);
      expect(result.issues.some(i => i.toLowerCase().includes('portrait'))).toBe(true);
    });
  });

  describe('getOptimalSettings', () => {
    it('should return camera settings', () => {
      const settings = productionImageValidation.getOptimalSettings();

      expect(settings.quality).toBe(1.0);
      expect(settings.zoom).toBe(1.0);
      expect(settings.flash).toBe('off');
      expect(settings.orientation).toBe('portrait');
      expect(settings.tips.length).toBeGreaterThan(0);
      expect(settings.minResolution.width).toBeGreaterThan(0);
      expect(settings.recommendedResolution.width).toBeGreaterThanOrEqual(
        settings.minResolution.width
      );
    });
  });
});
