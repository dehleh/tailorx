/**
 * Measurement Calibration Service
 * Improves accuracy using reference points and anthropometric ratios
 */

import { BodyMeasurement } from '../types/measurements';

interface CalibrationData {
  knownHeight?: number;
  knownMeasurement?: {
    type: keyof BodyMeasurement['measurements'];
    value: number;
  };
  pixelsPerCm?: number;
}

interface AnthropometricRatios {
  shoulderToHeight: number; // ~0.25
  waistToHeight: number; // ~0.45
  inseamToHeight: number; // ~0.47
  neckToWaist: number; // ~0.47
  hipsToWaist: number; // ~1.2
}

class CalibrationService {
  // Standard anthropometric ratios (average)
  private readonly standardRatios: AnthropometricRatios = {
    shoulderToHeight: 0.25,
    waistToHeight: 0.45,
    inseamToHeight: 0.47,
    neckToWaist: 0.47,
    hipsToWaist: 1.2,
  };

  /**
   * Calibrate measurements using known reference
   */
  calibrateMeasurements(
    rawMeasurements: BodyMeasurement['measurements'],
    calibrationData: CalibrationData
  ): BodyMeasurement['measurements'] {
    let calibrated = { ...rawMeasurements };

    // Step 1: Apply known height calibration
    if (calibrationData.knownHeight && rawMeasurements.height) {
      const scaleFactor = calibrationData.knownHeight / rawMeasurements.height;
      calibrated = this.scaleAllMeasurements(calibrated, scaleFactor);
    }

    // Step 2: Apply pixels per cm calibration
    if (calibrationData.pixelsPerCm) {
      // Used when reference object is in frame
      calibrated = this.applyPixelCalibration(calibrated, calibrationData.pixelsPerCm);
    }

    // Step 3: Apply anthropometric corrections
    calibrated = this.applyAnthropometricCorrections(calibrated);

    return calibrated;
  }

  /**
   * Scale all measurements by factor
   */
  private scaleAllMeasurements(
    measurements: BodyMeasurement['measurements'],
    scaleFactor: number
  ): BodyMeasurement['measurements'] {
    const scaled: Partial<BodyMeasurement['measurements']> = {};

    for (const [key, value] of Object.entries(measurements)) {
      if (typeof value === 'number' && key !== 'weight') {
        scaled[key as keyof BodyMeasurement['measurements']] = Math.round(value * scaleFactor * 10) / 10;
      } else {
        scaled[key as keyof BodyMeasurement['measurements']] = value;
      }
    }

    return scaled as BodyMeasurement['measurements'];
  }

  /**
   * Apply pixel-based calibration
   */
  private applyPixelCalibration(
    measurements: BodyMeasurement['measurements'],
    pixelsPerCm: number
  ): BodyMeasurement['measurements'] {
    // This would use the pixel measurements from ML model
    // and convert them to real-world measurements
    return measurements;
  }

  /**
   * Apply anthropometric ratio corrections
   */
  private applyAnthropometricCorrections(
    measurements: BodyMeasurement['measurements']
  ): BodyMeasurement['measurements'] {
    const corrected = { ...measurements };

    if (corrected.height) {
      // Validate shoulders ratio
      const expectedShoulders = corrected.height * this.standardRatios.shoulderToHeight;
      if (corrected.shoulders) {
        const shoulderDiff = Math.abs(corrected.shoulders - expectedShoulders);
        if (shoulderDiff > expectedShoulders * 0.2) {
          // If more than 20% off, apply correction
          corrected.shoulders = Math.round(
            (corrected.shoulders * 0.7 + expectedShoulders * 0.3) * 10
          ) / 10;
        }
      }

      // Validate inseam ratio
      const expectedInseam = corrected.height * this.standardRatios.inseamToHeight;
      if (corrected.inseam) {
        const inseamDiff = Math.abs(corrected.inseam - expectedInseam);
        if (inseamDiff > expectedInseam * 0.2) {
          corrected.inseam = Math.round(
            (corrected.inseam * 0.7 + expectedInseam * 0.3) * 10
          ) / 10;
        }
      }
    }

    // Validate waist-to-hip ratio
    if (corrected.waist && corrected.hips) {
      const ratio = corrected.hips / corrected.waist;
      if (ratio < 0.9 || ratio > 1.5) {
        // Ratio seems off, apply gentle correction
        const expectedHips = corrected.waist * this.standardRatios.hipsToWaist;
        corrected.hips = Math.round(
          (corrected.hips * 0.8 + expectedHips * 0.2) * 10
        ) / 10;
      }
    }

    return corrected;
  }

  /**
   * Calculate confidence score for measurements
   */
  calculateConfidence(
    measurements: BodyMeasurement['measurements'],
    mlConfidence: number
  ): number {
    let confidence = mlConfidence;

    // Reduce confidence if ratios are off
    if (measurements.height) {
      const ratioChecks = [
        {
          actual: measurements.shoulders ? measurements.shoulders / measurements.height : 0,
          expected: this.standardRatios.shoulderToHeight,
        },
        {
          actual: measurements.inseam ? measurements.inseam / measurements.height : 0,
          expected: this.standardRatios.inseamToHeight,
        },
      ];

      ratioChecks.forEach((check) => {
        if (check.actual > 0) {
          const deviation = Math.abs(check.actual - check.expected) / check.expected;
          if (deviation > 0.2) {
            confidence *= 0.9; // Reduce confidence by 10%
          }
        }
      });
    }

    return Math.max(0.5, Math.min(1, confidence));
  }

  /**
   * Average multiple measurements for better accuracy
   */
  averageMultipleMeasurements(
    measurementsList: BodyMeasurement['measurements'][]
  ): BodyMeasurement['measurements'] {
    if (measurementsList.length === 0) {
      throw new Error('No measurements to average');
    }

    if (measurementsList.length === 1) {
      return measurementsList[0];
    }

    // Remove outliers first
    const filtered = this.removeOutliers(measurementsList);

    // Calculate average
    const averaged: Partial<BodyMeasurement['measurements']> = {};
    const keys = Object.keys(filtered[0]) as (keyof BodyMeasurement['measurements'])[];

    keys.forEach((key) => {
      const values = filtered
        .map((m) => m[key])
        .filter((v): v is number => typeof v === 'number');

      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        averaged[key] = Math.round((sum / values.length) * 10) / 10;
      }
    });

    return averaged as BodyMeasurement['measurements'];
  }

  /**
   * Remove statistical outliers
   */
  private removeOutliers(
    measurements: BodyMeasurement['measurements'][]
  ): BodyMeasurement['measurements'][] {
    if (measurements.length < 3) {
      return measurements;
    }

    // Simple outlier detection using IQR method
    // For now, just return all measurements
    // TODO: Implement proper IQR outlier detection
    return measurements;
  }

  /**
   * Validate measurement consistency
   */
  validateConsistency(
    newMeasurement: BodyMeasurement['measurements'],
    previousMeasurements: BodyMeasurement['measurements'][]
  ): {
    isConsistent: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (previousMeasurements.length === 0) {
      return { isConsistent: true, warnings };
    }

    // Get average of previous measurements
    const avgPrevious = this.averageMultipleMeasurements(previousMeasurements);

    // Check each measurement
    const keys: (keyof BodyMeasurement['measurements'])[] = [
      'height',
      'chest',
      'waist',
      'hips',
      'shoulders',
    ];

    keys.forEach((key) => {
      const newValue = newMeasurement[key];
      const avgValue = avgPrevious[key];

      if (typeof newValue === 'number' && typeof avgValue === 'number') {
        const percentDiff = Math.abs((newValue - avgValue) / avgValue) * 100;

        if (percentDiff > 10) {
          warnings.push(
            `${key} differs by ${percentDiff.toFixed(1)}% from previous average`
          );
        }
      }
    });

    return {
      isConsistent: warnings.length === 0,
      warnings,
    };
  }
}

export const calibrationService = new CalibrationService();
