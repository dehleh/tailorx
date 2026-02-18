/**
 * Scan Results Screen
 * 
 * Shows detailed measurement results after a body scan:
 * - Overall accuracy badge
 * - Per-measurement breakdown with confidence
 * - Accuracy improvement recommendations
 * - Save confirmation & navigation options
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { Theme } from '../constants/theme';
import { AccuracyBadge, AccuracyReportCard } from '../components/AccuracyIndicator';
import { MeasurementResult } from '../services/measurementEngine';
import { AccuracyReport } from '../services/accuracyEngine';
import { useUserStore } from '../stores/userStore';

interface ScanResultsScreenProps {
  navigation: any;
  route: {
    params: {
      result: MeasurementResult;
      accuracyReport: AccuracyReport;
    };
  };
}

// ============================================================
// MEASUREMENT DISPLAY CONFIG
// ============================================================

const MEASUREMENT_META: Record<string, { icon: string; label: string; isWeight?: boolean }> = {
  height: { icon: '📏', label: 'Height' },
  weight: { icon: '⚖️', label: 'Weight', isWeight: true },
  chest: { icon: '👔', label: 'Chest' },
  waist: { icon: '👖', label: 'Waist' },
  hips: { icon: '🩳', label: 'Hips' },
  shoulders: { icon: '👕', label: 'Shoulders' },
  neck: { icon: '👔', label: 'Neck' },
  sleeve: { icon: '🧥', label: 'Sleeve' },
  inseam: { icon: '👖', label: 'Inseam' },
  thigh: { icon: '🦵', label: 'Thigh' },
  calf: { icon: '👟', label: 'Calf' },
};

export default function ScanResultsScreen({ navigation, route }: ScanResultsScreenProps) {
  const { result, accuracyReport } = route.params;
  const user = useUserStore((state) => state.user);
  const [unit, setUnit] = useState<'cm' | 'inch'>(user?.preferredUnit || 'cm');

  const convertToInch = (cm: number) => (cm / 2.54).toFixed(1);
  const displayValue = (cm: number, isWeight?: boolean) => {
    if (isWeight) return `${cm} kg`;
    return unit === 'cm' ? `${cm.toFixed(1)} cm` : `${convertToInch(cm)} in`;
  };

  // Build measurement list from result
  const measurementList = useMemo(() => {
    return Object.entries(result.measurements)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => {
        const meta = MEASUREMENT_META[key] || { icon: '📐', label: key };
        const confidence = result.confidence[key] || 0;
        const reportData = accuracyReport.perMeasurement[key];
        return {
          key,
          label: meta.label,
          icon: meta.icon,
          value,
          confidence,
          reliability: reportData?.reliability || 'low',
          estimatedError: reportData?.estimatedErrorCm || 5,
          isWeight: meta.isWeight,
        };
      })
      .sort((a, b) => b.confidence - a.confidence); // Show most confident first
  }, [result, accuracyReport]);

  // ============================================================
  // EXPORT
  // ============================================================

  const handleExport = async () => {
    const lines = [
      'Tailor-X Body Measurements',
      `Date: ${new Date().toLocaleDateString()}`,
      `Overall Accuracy: ${result.overallAccuracy}%`,
      `Engine: ${result.metadata.engineVersion}`,
      '',
      'Measurements:',
      ...measurementList.map(m =>
        `  ${m.label}: ${displayValue(m.value, m.isWeight)} (±${m.estimatedError}cm, ${m.confidence}% conf)`
      ),
    ];

    if (result.warnings.length > 0) {
      lines.push('', 'Warnings:', ...result.warnings.map(w => `  ⚠️ ${w}`));
    }

    try {
      await Share.share({
        title: 'Tailor-X Measurements',
        message: lines.join('\n'),
      });
    } catch (e) {
      // User cancelled
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <ScrollView style={styles.container}>
      {/* Header with accuracy */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan Results</Text>
        <Text style={styles.headerSubtitle}>
          {result.metadata.anglesUsed.length} angle(s) • {result.metadata.processingTimeMs}ms
        </Text>
        <View style={styles.accuracyBadgeRow}>
          <AccuracyBadge accuracy={result.overallAccuracy} size="large" />
        </View>

        {result.warnings.length > 0 && (
          <View style={styles.warningsBox}>
            {result.warnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>⚠️ {w}</Text>
            ))}
          </View>
        )}
      </View>

      {/* Unit toggle */}
      <View style={styles.unitRow}>
        <TouchableOpacity
          style={[styles.unitButton, unit === 'cm' && styles.unitButtonActive]}
          onPress={() => setUnit('cm')}
        >
          <Text style={[styles.unitButtonText, unit === 'cm' && styles.unitButtonTextActive]}>CM</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.unitButton, unit === 'inch' && styles.unitButtonActive]}
          onPress={() => setUnit('inch')}
        >
          <Text style={[styles.unitButtonText, unit === 'inch' && styles.unitButtonTextActive]}>INCH</Text>
        </TouchableOpacity>
      </View>

      {/* Measurement cards */}
      <View style={styles.measurementsSection}>
        {measurementList.map((m) => (
          <View key={m.key} style={styles.measurementCard}>
            <View style={styles.measurementLeft}>
              <Text style={styles.measurementIcon}>{m.icon}</Text>
              <View>
                <Text style={styles.measurementLabel}>{m.label}</Text>
                <Text style={[
                  styles.reliabilityText,
                  m.reliability === 'high' && { color: Theme.colors.success },
                  m.reliability === 'medium' && { color: Theme.colors.warning },
                  m.reliability === 'low' && { color: Theme.colors.error },
                ]}>
                  {m.reliability === 'high' ? '✓ High' :
                   m.reliability === 'medium' ? '~ Medium' : '! Low'} confidence
                </Text>
              </View>
            </View>
            <View style={styles.measurementRight}>
              <Text style={styles.measurementValue}>
                {displayValue(m.value, m.isWeight)}
              </Text>
              <Text style={styles.errorRange}>±{m.estimatedError}cm</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Accuracy report */}
      <View style={styles.reportSection}>
        <AccuracyReportCard
          overallAccuracy={result.overallAccuracy}
          recommendations={accuracyReport.recommendations}
          perMeasurement={accuracyReport.perMeasurement}
          onImprove={() => navigation.navigate('Scan')}
        />
      </View>

      {/* Improvement potential */}
      {accuracyReport.improvementPotential && (
        <View style={styles.improvementSection}>
          <Text style={styles.improvementTitle}>📈 Improvement Potential</Text>
          <View style={styles.improvementCards}>
            <ImprovementCard
              label="With Calibration"
              value={accuracyReport.improvementPotential.withCalibration}
              current={result.overallAccuracy}
            />
            <ImprovementCard
              label="With Side View"
              value={accuracyReport.improvementPotential.withSideView}
              current={result.overallAccuracy}
            />
            <ImprovementCard
              label="Multiple Scans"
              value={accuracyReport.improvementPotential.withMultipleScans}
              current={result.overallAccuracy}
            />
          </View>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Text style={styles.exportButtonText}>📤 Share Results</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Measurements')}
        >
          <Text style={styles.primaryButtonText}>View All Measurements</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <Text style={styles.secondaryButtonText}>📸 Scan Again</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function ImprovementCard({
  label,
  value,
  current,
}: {
  label: string;
  value: number;
  current: number;
}) {
  const delta = value - current;
  if (delta <= 0) return null;

  return (
    <View style={styles.improvementCard}>
      <Text style={styles.improvementLabel}>{label}</Text>
      <Text style={styles.improvementValue}>+{delta}%</Text>
      <Text style={styles.improvementTarget}>→ {value}%</Text>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    marginBottom: Theme.spacing.md,
  },
  accuracyBadgeRow: {
    marginBottom: Theme.spacing.sm,
  },
  warningsBox: {
    backgroundColor: '#FEF3C7',
    padding: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    marginTop: Theme.spacing.sm,
    width: '100%',
  },
  warningText: {
    fontSize: Theme.fontSize.xs,
    color: '#92400E',
    marginBottom: 2,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.sm,
    backgroundColor: Theme.colors.white,
    marginBottom: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  unitButton: {
    paddingVertical: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  unitButtonActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  unitButtonText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.secondary,
  },
  unitButtonTextActive: {
    color: Theme.colors.white,
  },
  measurementsSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  measurementCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadows.small,
  },
  measurementLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  measurementIcon: {
    fontSize: 24,
  },
  measurementLabel: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.medium,
    color: Theme.colors.text.primary,
  },
  reliabilityText: {
    fontSize: Theme.fontSize.xs,
    marginTop: 2,
  },
  measurementRight: {
    alignItems: 'flex-end',
  },
  measurementValue: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.primary,
  },
  errorRange: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.light,
    marginTop: 2,
  },
  reportSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  improvementSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  improvementTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
  },
  improvementCards: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  improvementCard: {
    flex: 1,
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  improvementLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  improvementValue: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.success,
  },
  improvementTarget: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.light,
  },
  actions: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
  },
  exportButton: {
    backgroundColor: Theme.colors.white,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.primary,
  },
  exportButtonText: {
    color: Theme.colors.primary,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    alignItems: 'center',
    ...Theme.shadows.medium,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  secondaryButton: {
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Theme.colors.text.secondary,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.medium,
  },
});
