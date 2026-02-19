/**
 * Scan Results Screen — polished, user-friendly design
 *
 * - Clean hero header with large accuracy bubble
 * - Per-measurement cards with soft confidence badges (no scary red)
 * - Floating-point numbers properly rounded
 * - Actionable improvement tips
 * - Export & navigation
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Theme } from '../constants/theme';
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

const MEASUREMENT_META: Record<
  string,
  { icon: string; label: string; isWeight?: boolean }
> = {
  chest: { icon: '👔', label: 'Chest' },
  waist: { icon: '👖', label: 'Waist' },
  hips: { icon: '🩳', label: 'Hips' },
  shoulders: { icon: '👕', label: 'Shoulders' },
  neck: { icon: '👔', label: 'Neck' },
  height: { icon: '📏', label: 'Height' },
  sleeve: { icon: '🧥', label: 'Sleeve' },
  inseam: { icon: '👖', label: 'Inseam' },
  thigh: { icon: '🦵', label: 'Thigh' },
  calf: { icon: '👟', label: 'Calf' },
  weight: { icon: '⚖️', label: 'Weight', isWeight: true },
};

// ============================================================
// HELPERS
// ============================================================

/** Round to 1 decimal, avoids floating-point noise like 10.800000000000004 */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Score → friendly label, colour, background, emoji */
function getScoreInfo(score: number) {
  if (score >= 85)
    return { label: 'Excellent', color: '#10B981', bg: '#D1FAE5', emoji: '🎯' };
  if (score >= 70)
    return { label: 'Good', color: '#F59E0B', bg: '#FEF3C7', emoji: '👍' };
  if (score >= 55)
    return { label: 'Fair', color: '#F97316', bg: '#FFEDD5', emoji: '📐' };
  return { label: 'Estimate', color: '#8B5CF6', bg: '#EDE9FE', emoji: '🔬' };
}

/** Per-measurement confidence → soft badge (purple "Estimated" instead of red "Low") */
function getConfidenceInfo(conf: number) {
  if (conf >= 80)
    return { label: 'High', color: '#10B981', bg: '#ECFDF5' };
  if (conf >= 60)
    return { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' };
  return { label: 'Estimated', color: '#8B5CF6', bg: '#F5F3FF' };
}

export default function ScanResultsScreen({
  navigation,
  route,
}: ScanResultsScreenProps) {
  const { result, accuracyReport } = route.params;
  const user = useUserStore((state) => state.user);
  const [unit, setUnit] = useState<'cm' | 'inch'>(
    user?.preferredUnit || 'cm',
  );

  /** Format a measurement value with proper rounding */
  const formatValue = (cm: number, isWeight?: boolean) => {
    if (isWeight) return `${round1(cm)} kg`;
    return unit === 'cm'
      ? `${round1(cm)} cm`
      : `${round1(cm / 2.54)} in`;
  };

  /** Format the error range with proper rounding */
  const formatError = (errCm: number) => {
    const v =
      unit === 'cm' ? round1(errCm) : round1(errCm / 2.54);
    return `±${v} ${unit === 'cm' ? 'cm' : 'in'}`;
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
      .sort((a, b) => b.confidence - a.confidence);
  }, [result, accuracyReport]);

  const scoreInfo = getScoreInfo(result.overallAccuracy);

  // ============================================================
  // EXPORT
  // ============================================================

  const handleExport = async () => {
    const lines = [
      '📐 Tailor-X Body Measurements',
      `Date: ${new Date().toLocaleDateString()}`,
      `Accuracy: ${result.overallAccuracy}%`,
      '',
      ...measurementList.map(
        (m) =>
          `${m.label}: ${formatValue(m.value, m.isWeight)} (${formatError(m.estimatedError)})`,
      ),
    ];

    try {
      await Share.share({
        title: 'Tailor-X Measurements',
        message: lines.join('\n'),
      });
    } catch {
      // User cancelled
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero header ── */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Your Measurements</Text>
        <Text style={styles.heroSubtitle}>
          {measurementList.length} measurements captured
        </Text>

        <View style={[styles.scoreBubble, { backgroundColor: scoreInfo.bg }]}>
          <Text style={styles.scoreEmoji}>{scoreInfo.emoji}</Text>
          <Text style={[styles.scoreValue, { color: scoreInfo.color }]}>
            {result.overallAccuracy}%
          </Text>
          <Text style={[styles.scoreLabel, { color: scoreInfo.color }]}>
            {scoreInfo.label}
          </Text>
        </View>

        <Text style={styles.heroMeta}>
          {result.metadata.anglesUsed.length} angle
          {result.metadata.anglesUsed.length !== 1 ? 's' : ''} captured
        </Text>
      </View>

      {/* ── Unit toggle ── */}
      <View style={styles.unitRow}>
        {(['cm', 'inch'] as const).map((u) => (
          <TouchableOpacity
            key={u}
            style={[
              styles.unitButton,
              unit === u && styles.unitButtonActive,
            ]}
            onPress={() => setUnit(u)}
          >
            <Text
              style={[
                styles.unitButtonText,
                unit === u && styles.unitButtonTextActive,
              ]}
            >
              {u === 'cm' ? 'CM' : 'INCH'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Measurement cards ── */}
      <View style={styles.cardsSection}>
        {measurementList.map((m) => {
          const ci = getConfidenceInfo(m.confidence);
          return (
            <View key={m.key} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.iconCircle}>
                  <Text style={styles.cardIcon}>{m.icon}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardLabel}>{m.label}</Text>
                  <View
                    style={[styles.confBadge, { backgroundColor: ci.bg }]}
                  >
                    <Text style={[styles.confBadgeText, { color: ci.color }]}>
                      {ci.label}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.cardValue}>
                  {formatValue(m.value, m.isWeight)}
                </Text>
                <Text style={styles.cardError}>
                  {formatError(m.estimatedError)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Tips to improve ── */}
      {accuracyReport.recommendations.length > 0 && (
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Tips for better accuracy</Text>
          {accuracyReport.recommendations.slice(0, 3).map((rec, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={styles.tipDot} />
              <Text style={styles.tipText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Improvement potential ── */}
      {accuracyReport.improvementPotential && (
        <View style={styles.improvementSection}>
          <Text style={styles.sectionTitle}>📈 You could reach</Text>
          <View style={styles.improvementRow}>
            <ImprovementChip
              label="With Calibration"
              value={accuracyReport.improvementPotential.withCalibration}
              current={result.overallAccuracy}
            />
            <ImprovementChip
              label="Side View"
              value={accuracyReport.improvementPotential.withSideView}
              current={result.overallAccuracy}
            />
            <ImprovementChip
              label="Multi-Scan"
              value={
                accuracyReport.improvementPotential.withMultipleScans
              }
              current={result.overallAccuracy}
            />
          </View>
        </View>
      )}

      {/* ── Warnings (non-alarming) ── */}
      {result.warnings.length > 0 && (
        <View style={styles.warningsCard}>
          {result.warnings.map((w, i) => (
            <Text key={i} style={styles.warningText}>
              💬 {w}
            </Text>
          ))}
        </View>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Measurements')}
        >
          <Text style={styles.primaryBtnText}>
            📏 View All Measurements
          </Text>
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={handleExport}
          >
            <Text style={styles.outlineBtnText}>📤 Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => navigation.navigate('Scan')}
          >
            <Text style={styles.outlineBtnText}>📸 Rescan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function ImprovementChip({
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
    <View style={styles.improvementChip}>
      <Text style={styles.improvementChipDelta}>+{delta}%</Text>
      <Text style={styles.improvementChipTarget}>{value}%</Text>
      <Text style={styles.improvementChipLabel}>{label}</Text>
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

  // ── Hero ──
  hero: {
    backgroundColor: Theme.colors.white,
    paddingTop: Theme.spacing.xl,
    paddingBottom: Theme.spacing.lg,
    paddingHorizontal: Theme.spacing.lg,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...Theme.shadows.small,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Theme.colors.text.primary,
  },
  heroSubtitle: {
    fontSize: 14,
    color: Theme.colors.text.secondary,
    marginTop: 4,
    marginBottom: Theme.spacing.lg,
  },
  scoreBubble: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.sm,
  },
  scoreEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '800' as const,
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: -2,
  },
  heroMeta: {
    fontSize: 12,
    color: Theme.colors.text.light,
  },

  // ── Unit toggle ──
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  unitButton: {
    paddingVertical: 8,
    paddingHorizontal: 28,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.white,
  },
  unitButtonActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  unitButtonText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Theme.colors.text.secondary,
    letterSpacing: 1,
  },
  unitButtonTextActive: {
    color: Theme.colors.white,
  },

  // ── Measurement cards ──
  cardsSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    ...Theme.shadows.small,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 22,
  },
  cardInfo: {
    gap: 4,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Theme.colors.text.primary,
  },
  confBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Theme.colors.text.primary,
  },
  cardError: {
    fontSize: 11,
    color: Theme.colors.text.light,
    marginTop: 2,
  },

  // ── Tips ──
  tipsCard: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    padding: Theme.spacing.lg,
    borderRadius: 16,
    ...Theme.shadows.small,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Theme.colors.text.primary,
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.colors.primary,
    marginTop: 6,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: Theme.colors.text.secondary,
    lineHeight: 19,
  },

  // ── Improvement ──
  improvementSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Theme.colors.text.primary,
    marginBottom: 10,
  },
  improvementRow: {
    flexDirection: 'row',
    gap: 10,
  },
  improvementChip: {
    flex: 1,
    backgroundColor: Theme.colors.white,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  improvementChipDelta: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#10B981',
  },
  improvementChipTarget: {
    fontSize: 12,
    color: Theme.colors.text.secondary,
    marginTop: 2,
  },
  improvementChipLabel: {
    fontSize: 11,
    color: Theme.colors.text.light,
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Warnings (gentle) ──
  warningsCard: {
    backgroundColor: '#FFFBEB',
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    padding: Theme.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
    marginBottom: 4,
    lineHeight: 18,
  },

  // ── Actions ──
  actions: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: 40,
  },
  primaryBtn: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    ...Theme.shadows.medium,
  },
  primaryBtnText: {
    color: Theme.colors.white,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  outlineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
  },
  outlineBtnText: {
    color: Theme.colors.text.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
