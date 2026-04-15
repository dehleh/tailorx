/**
 * Scan Results Screen — matches design mockup
 *
 * - Green "Scan Complete" header
 * - Security notice
 * - Body silhouette with measurements
 * - Gridded measurement cards
 * - Accuracy percentage
 * - Save / Share / Rescan
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../constants/colors';
import { MeasurementResult } from '../services/measurementEngine';
import { AccuracyReport } from '../services/accuracyEngine';
import { useMeasurementStore } from '../stores/measurementStore';
import { useAuthStore } from '../stores/authStore';
import { useUserStore } from '../stores/userStore';
import { lookupSize, SizeLookupResult } from '../services/sizeChartService';
import { generateId } from '../utils/helpers';
import ShareModal from '../components/ShareModal';

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
  // Universal
  height: { icon: '📏', label: 'Height' },
  weight: { icon: '⚖️', label: 'Weight', isWeight: true },
  shoulders: { icon: '👕', label: 'Shoulders' },
  neck: { icon: '👔', label: 'Neck' },
  sleeve: { icon: '🧥', label: 'Sleeve' },
  waist: { icon: '👖', label: 'Waist' },
  hips: { icon: '🩳', label: 'Hips' },
  // Chest / Bust (same field, labelled universally as Chest)
  chest: { icon: '👔', label: 'Chest / Bust' },
  // Female-specific
  underbust: { icon: '👙', label: 'Under Bust' },
  halfLength: { icon: '📐', label: 'Half Length' },
  topLength: { icon: '📏', label: 'Top Length' },
  // Arm (all genders)
  roundSleeveBicep: { icon: '💪', label: 'Bicep' },
  roundSleeveElbow: { icon: '🦾', label: 'Elbow' },
  // Male lower-body
  inseam: { icon: '👖', label: 'Inseam' },
  thigh: { icon: '🦵', label: 'Thigh' },
  calf: { icon: '👟', label: 'Calf' },
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
  // Guard against missing params (can happen on nav reset or deep link)
  const result = route?.params?.result;
  const accuracyReport = route?.params?.accuracyReport;

  const authUser = useAuthStore((s) => s.user);
  const userProfile = useUserStore((s) => s.user);
  const addMeasurement = useMeasurementStore((s) => s.addMeasurement);
  const [unit, setUnit] = useState<'cm' | 'inch'>('cm');
  const [shareVisible, setShareVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  // Measurement is auto-saved during processing — mark as already saved
  const [saved, setSaved] = useState(true);
  const measurementId = useMemo(() => generateId(), []);

  const formatValue = (cm: number) => {
    return unit === 'cm'
      ? `${round1(cm)} cm`
      : `${round1(cm / 2.54)} in`;
  };

  // If params are missing, show fallback instead of crashing
  if (!result || !result.measurements) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: 20 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📐</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 }}>
          No Results Available
        </Text>
        <Text style={{ fontSize: 14, color: Colors.text.secondary, textAlign: 'center', marginBottom: 24 }}>
          Measurement data was not found. Please try scanning again.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('PreparationChecklist')}
          style={{ backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Start New Scan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const measurementGrid = useMemo(() => {
    return Object.entries(result.measurements)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => {
        const meta = MEASUREMENT_META[key] || { icon: '📐', label: key };
        return { key, label: meta.label, icon: meta.icon, value, isWeight: meta.isWeight };
      });
  }, [result]);

  const sizeResult: SizeLookupResult | null = useMemo(() => {
    const gender = (userProfile?.gender as 'male' | 'female' | 'other') || 'other';
    if (!result.measurements || Object.keys(result.measurements).length === 0) return null;
    return lookupSize(result.measurements, gender);
  }, [result, userProfile]);

  const handleSave = async () => {
    if (saved) return;
    await addMeasurement({
      id: measurementId,
      userId: authUser?.id || 'local',
      date: new Date(),
      measurements: result.measurements as any,
      unit,
      accuracy: {
        overallScore: result.overallAccuracy,
        confidence: result.confidence,
        anglesUsed: result.metadata.anglesUsed,
        calibrationMethod: result.metadata.calibrationMethod,
        engineVersion: result.metadata.engineVersion,
        processingTimeMs: result.metadata.processingTimeMs,
        warnings: result.warnings,
      },
    });
    setSaved(true);
  };

  const handleRescan = () => {
    navigation.navigate('ScanHome');
  };

  return (
    <>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Green header */}
        <View style={styles.hero}>
          <View style={styles.checkCircle}>
            <Text style={styles.checkIcon}>✓</Text>
          </View>
          <Text style={styles.heroTitle}>Scan Complete!</Text>
          <Text style={styles.heroSubtitle}>Your measurements are ready.</Text>
        </View>

        {/* Security notice */}
        <View style={styles.securityNotice}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>
            Your data is encrypted and secure. Only you can share it.
          </Text>
        </View>

        {/* Body silhouette */}
        <View style={styles.silhouetteSection}>
          <Text style={styles.silhouetteIcon}>🧍</Text>
        </View>

        {/* Measurements heading */}
        <Text style={styles.measurementsTitle}>Your Measurements</Text>

        {/* Measurement grid */}
        <View style={styles.grid}>
          {measurementGrid.map((m) => (
            <View key={m.key} style={styles.gridCard}>
              <Text style={styles.gridIcon}>{m.icon}</Text>
              <Text style={styles.gridLabel}>{m.label}</Text>
              <Text style={styles.gridValue}>
                {m.isWeight ? `${round1(m.value)} kg` : formatValue(m.value)}
              </Text>
            </View>
          ))}
        </View>

        {/* Accuracy */}
        <View style={styles.accuracyCard}>
          <Text style={styles.accuracyIcon}>🎯</Text>
          <View style={styles.accuracyTextContent}>
            <Text style={styles.accuracyTitle}>Accuracy: {result.overallAccuracy}%</Text>
            <Text style={styles.accuracyDesc}>
              These measurements are comparable to professional tailoring standards.
            </Text>
          </View>
        </View>

        {/* Size Recommendation */}
        {sizeResult && (
          <View style={styles.sizeCard}>
            <Text style={styles.sizeCardTitle}>👕 Recommended Size</Text>
            <View style={styles.sizeBadgeRow}>
              <View style={styles.sizeBadge}>
                <Text style={styles.sizeBadgeText}>{sizeResult.recommendedSize}</Text>
              </View>
              <Text style={styles.sizeStandard}>ISO 8559-1</Text>
            </View>
            {Object.keys(sizeResult.perMeasurement).length > 0 && (
              <View style={styles.sizeBreakdown}>
                {Object.entries(sizeResult.perMeasurement).map(([key, size]) => (
                  <View key={key} style={styles.sizeBreakdownRow}>
                    <Text style={styles.sizeBreakdownLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                    <Text style={[
                      styles.sizeBreakdownValue,
                      size !== sizeResult.recommendedSize && styles.sizeBreakdownMismatch,
                    ]}>{size}</Text>
                  </View>
                ))}
              </View>
            )}
            {sizeResult.notes.length > 0 && (
              <View style={styles.sizeNotes}>
                {sizeResult.notes.map((note, i) => (
                  <Text key={i} style={styles.sizeNoteText}>💡 {note}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, saved && styles.saveButtonDone]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>
              {saved ? '✓ Saved' : '💾 Save measurements'}
            </Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => setShareVisible(true)}
            >
              <Text style={styles.outlineButtonText}>🔗 Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineButton} onPress={handleRescan}>
              <Text style={styles.outlineButtonText}>🔄 Rescan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scan Details (always visible in production — tap to expand) */}
        <TouchableOpacity
          style={styles.detailsHeader}
          onPress={() => setDetailsExpanded(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.detailsHeaderText}>🔍 Scan Details</Text>
          <Text style={styles.detailsChevron}>{detailsExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {detailsExpanded && (
          <View style={styles.detailsBody}>
            {/* Processing metadata */}
            <Text style={styles.detailsRow}>
              <Text style={styles.detailsKey}>Angles: </Text>
              {result.metadata.anglesUsed.join(', ')}
            </Text>
            <Text style={styles.detailsRow}>
              <Text style={styles.detailsKey}>Calibration: </Text>
              {result.metadata.calibrationMethod}
            </Text>
            <Text style={styles.detailsRow}>
              <Text style={styles.detailsKey}>Contour: </Text>
              {result.metadata.contourUsed ? 'Yes ✔' : 'No (skeleton only)'}
            </Text>
            <Text style={styles.detailsRow}>
              <Text style={styles.detailsKey}>Processing: </Text>
              {result.metadata.processingTimeMs}ms
            </Text>
            <Text style={styles.detailsRow}>
              <Text style={styles.detailsKey}>Engine: </Text>
              {result.metadata.engineVersion}
            </Text>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <View style={styles.detailsWarningBox}>
                <Text style={styles.detailsWarningTitle}>⚠ Warnings</Text>
                {result.warnings.map((w, i) => (
                  <Text key={i} style={styles.detailsWarningText}>• {w}</Text>
                ))}
              </View>
            )}

            {/* Per-measurement confidence */}
            <Text style={[styles.detailsKey, { marginTop: 10, marginBottom: 4 }]}>Confidence per measurement:</Text>
            {Object.entries(result.confidence).map(([k, v]) => (
              <Text key={k} style={styles.detailsRow}>
                <Text style={styles.detailsKey}>{k}: </Text>
                {v}%
              </Text>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <ShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        measurementId={measurementId}
        measurements={result.measurements}
        unit={unit}
      />
    </>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  hero: {
    backgroundColor: Colors.primary,
    paddingTop: 48,
    paddingBottom: 28,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkIcon: {
    fontSize: 28,
    color: Colors.white,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FFF4',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  securityIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  silhouetteSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  silhouetteIcon: {
    fontSize: 64,
    opacity: 0.4,
  },
  measurementsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  gridCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    margin: '1.5%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gridIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  gridLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  accuracyCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'flex-start',
  },
  accuracyIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  accuracyTextContent: {
    flex: 1,
  },
  accuracyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  accuracyDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  actions: {
    paddingHorizontal: 20,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border || '#E5E7EB',
  },
  detailsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  detailsChevron: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  detailsBody: {
    marginHorizontal: 20,
    marginTop: 2,
    padding: 14,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.border || '#E5E7EB',
  },
  detailsRow: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 3,
  },
  detailsKey: {
    fontWeight: '600',
    color: Colors.text.primary,
  },
  detailsWarningBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 4,
  },
  detailsWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  detailsWarningText: {
    fontSize: 12,
    color: '#78350F',
    marginBottom: 2,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonDone: {
    backgroundColor: Colors.success,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  outlineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  outlineButtonText: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  // Size recommendation card
  sizeCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sizeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  sizeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sizeBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  sizeBadgeText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  sizeStandard: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  sizeBreakdown: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  sizeBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sizeBreakdownLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  sizeBreakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  sizeBreakdownMismatch: {
    color: '#F59E0B',
  },
  sizeNotes: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  sizeNoteText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
    marginBottom: 2,
  },
});
