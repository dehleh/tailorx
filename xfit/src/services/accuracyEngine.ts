/**
 * Accuracy Engine
 * 
 * Statistical analysis and improvement of measurement accuracy.
 * Uses ensemble methods, historical data, and cross-validation.
 */

import { MeasurementResult } from './measurementEngine';
import { BodyMeasurement } from '../types/measurements';

// ============================================================
// TYPES
// ============================================================

export interface AccuracyReport {
  overallScore: number; // 0-100
  perMeasurement: Record<string, {
    confidence: number;
    reliability: 'high' | 'medium' | 'low';
    estimatedErrorCm: number;
    suggestion?: string;
  }>;
  recommendations: string[];
  improvementPotential: {
    withCalibration: number;
    withSideView: number;
    withMultipleScans: number;
  };
}

export interface EnsembleResult {
  measurements: Record<string, number>;
  confidence: Record<string, number>;
  scansUsed: number;
  outliersRemoved: number;
}

// ============================================================
// ACCURACY ENGINE
// ============================================================

class AccuracyEngine {
  /**
   * Analyze accuracy of a measurement result and provide improvement suggestions
   */
  analyzeAccuracy(
    result: MeasurementResult,
    previousMeasurements: BodyMeasurement[] = []
  ): AccuracyReport {
    const perMeasurement: AccuracyReport['perMeasurement'] = {};
    const recommendations: string[] = [];

    // Analyze each measurement
    for (const [key, value] of Object.entries(result.measurements)) {
      const conf = result.confidence[key] || 50;
      let reliability: 'high' | 'medium' | 'low' = 'low';
      let estimatedErrorCm = 0;
      let suggestion: string | undefined;

      if (conf >= 85) {
        reliability = 'high';
        estimatedErrorCm = 1.5;
      } else if (conf >= 70) {
        reliability = 'medium';
        estimatedErrorCm = 3.0;
      } else {
        reliability = 'low';
        estimatedErrorCm = 5.0;
        suggestion = `Low confidence for ${key}. Try better lighting and ensure full visibility.`;
      }

      // Cross-validate with historical data
      if (previousMeasurements.length > 0) {
        const historicalValues = previousMeasurements
          .map(m => m.measurements[key as keyof typeof m.measurements])
          .filter((v): v is number => typeof v === 'number' && v > 0);

        if (historicalValues.length >= 2) {
          const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
          const deviation = Math.abs(value - mean);
          const percentDeviation = (deviation / mean) * 100;

          if (percentDeviation > 15) {
            reliability = 'low';
            estimatedErrorCm = Math.max(estimatedErrorCm, deviation);
            suggestion = `${key} differs ${percentDeviation.toFixed(1)}% from your average. Consider re-scanning.`;
          } else if (percentDeviation > 8) {
            if (reliability === 'high') reliability = 'medium';
            suggestion = `${key} shows some variation from your average (${percentDeviation.toFixed(1)}%).`;
          }
        }
      }

      perMeasurement[key] = {
        confidence: conf,
        reliability,
        estimatedErrorCm,
        suggestion,
      };
    }

    // Generate recommendations
    if (!result.metadata.anglesUsed.includes('side')) {
      recommendations.push(
        'Add a side-view photo to improve circumference accuracy by 40-60%'
      );
    }

    if (result.metadata.calibrationMethod === 'estimated') {
      recommendations.push(
        'Use a reference object (credit card) or enter your height for 2-3x better accuracy'
      );
    }

    if (previousMeasurements.length < 3) {
      recommendations.push(
        'Take 3+ scans and use averaged measurements for best consistency'
      );
    }

    const lowConfItems = Object.entries(perMeasurement)
      .filter(([, v]) => v.reliability === 'low')
      .map(([k]) => k);

    if (lowConfItems.length > 0) {
      recommendations.push(
        `Low reliability for: ${lowConfItems.join(', ')}. Ensure full body visibility and good lighting.`
      );
    }

    // Calculate overall score
    const confValues = Object.values(perMeasurement).map(v => v.confidence);
    const overallScore = confValues.length > 0
      ? Math.round(confValues.reduce((a, b) => a + b, 0) / confValues.length)
      : 0;

    // Calculate improvement potential
    const currentScore = overallScore;
    const improvementPotential = {
      withCalibration: result.metadata.calibrationMethod === 'estimated'
        ? Math.min(98, currentScore + 15)
        : currentScore,
      withSideView: !result.metadata.anglesUsed.includes('side')
        ? Math.min(98, currentScore + 12)
        : currentScore,
      withMultipleScans: Math.min(98, currentScore + 5),
    };

    return {
      overallScore,
      perMeasurement,
      recommendations,
      improvementPotential,
    };
  }

  /**
   * Ensemble averaging: Combine multiple scan results for better accuracy
   * Uses IQR-based outlier detection and weighted averaging
   */
  ensembleAverage(
    results: MeasurementResult[]
  ): EnsembleResult {
    if (results.length === 0) {
      throw new Error('No results to ensemble');
    }

    if (results.length === 1) {
      return {
        measurements: results[0].measurements,
        confidence: results[0].confidence,
        scansUsed: 1,
        outliersRemoved: 0,
      };
    }

    const allKeys = Object.keys(results[0].measurements);
    const ensembleMeasurements: Record<string, number> = {};
    const ensembleConfidence: Record<string, number> = {};
    let totalOutliersRemoved = 0;

    for (const key of allKeys) {
      const values = results
        .map((r, i) => ({
          value: r.measurements[key],
          confidence: r.confidence[key] || 50,
          index: i,
        }))
        .filter(v => v.value !== undefined && v.value > 0);

      if (values.length === 0) continue;

      // Remove outliers using IQR method
      const sorted = [...values].sort((a, b) => a.value - b.value);
      const q1Index = Math.floor(sorted.length * 0.25);
      const q3Index = Math.floor(sorted.length * 0.75);
      const q1 = sorted[q1Index].value;
      const q3 = sorted[q3Index].value;
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      const filtered = values.filter(v =>
        v.value >= lowerBound && v.value <= upperBound
      );
      totalOutliersRemoved += values.length - filtered.length;

      // Confidence-weighted average
      const totalWeight = filtered.reduce((sum, v) => sum + v.confidence, 0);
      const weightedSum = filtered.reduce(
        (sum, v) => sum + v.value * v.confidence,
        0
      );

      ensembleMeasurements[key] = Math.round((weightedSum / totalWeight) * 10) / 10;

      // Ensemble confidence is higher than individual (√n improvement)
      const avgConf = filtered.reduce((sum, v) => sum + v.confidence, 0) / filtered.length;
      const nBonus = Math.min(15, Math.sqrt(filtered.length) * 5);
      ensembleConfidence[key] = Math.min(98, Math.round(avgConf + nBonus));
    }

    return {
      measurements: ensembleMeasurements,
      confidence: ensembleConfidence,
      scansUsed: results.length,
      outliersRemoved: totalOutliersRemoved,
    };
  }

  /**
   * Detect if a new measurement is an outlier compared to history
   */
  detectOutlier(
    newMeasurement: Record<string, number>,
    history: BodyMeasurement[],
    threshold: number = 2.5 // z-score threshold
  ): {
    isOutlier: boolean;
    outlierKeys: string[];
    details: Record<string, { zScore: number; expected: number; actual: number }>;
  } {
    if (history.length < 3) {
      return { isOutlier: false, outlierKeys: [], details: {} };
    }

    const outlierKeys: string[] = [];
    const details: Record<string, { zScore: number; expected: number; actual: number }> = {};

    for (const [key, newValue] of Object.entries(newMeasurement)) {
      const historicalValues = history
        .map(m => m.measurements[key as keyof typeof m.measurements])
        .filter((v): v is number => typeof v === 'number' && v > 0);

      if (historicalValues.length < 3) continue;

      const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
      const variance = historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / historicalValues.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        const zScore = Math.abs(newValue - mean) / stdDev;
        if (zScore > threshold) {
          outlierKeys.push(key);
          details[key] = { zScore, expected: mean, actual: newValue };
        }
      }
    }

    return {
      isOutlier: outlierKeys.length > 0,
      outlierKeys,
      details,
    };
  }

  /**
   * Get expected accuracy ranges based on conditions
   */
  getExpectedAccuracy(conditions: {
    hasCalibration: boolean;
    hasSideView: boolean;
    hasBackView: boolean;
    landmarkConfidence: number;
    lightingQuality: 'good' | 'medium' | 'poor';
  }): {
    linearMeasurements: string;
    circumferences: string;
    overallRating: string;
  } {
    let linearError = 5; // base ±5cm
    let circumError = 8; // base ±8cm

    if (conditions.hasCalibration) {
      linearError -= 2;
      circumError -= 3;
    }

    if (conditions.hasSideView) {
      circumError -= 3;
    }

    if (conditions.hasBackView) {
      circumError -= 1;
    }

    if (conditions.landmarkConfidence > 0.8) {
      linearError -= 1;
      circumError -= 1;
    }

    if (conditions.lightingQuality === 'poor') {
      linearError += 2;
      circumError += 2;
    }

    linearError = Math.max(1, linearError);
    circumError = Math.max(1.5, circumError);

    const avgError = (linearError + circumError) / 2;
    let rating = 'Poor';
    if (avgError <= 2) rating = 'Excellent';
    else if (avgError <= 3) rating = 'Good';
    else if (avgError <= 5) rating = 'Fair';

    return {
      linearMeasurements: `±${linearError}cm`,
      circumferences: `±${circumError}cm`,
      overallRating: rating,
    };
  }
}

export const accuracyEngine = new AccuracyEngine();
