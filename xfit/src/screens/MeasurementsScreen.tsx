import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { Theme } from '../constants/theme';
import { useMeasurementStore } from '../stores/measurementStore';
import { useUserStore } from '../stores/userStore';
import { BodyMeasurement } from '../types/measurements';

export default function MeasurementsScreen({ navigation }: any) {
  const [unit, setUnit] = useState<'cm' | 'inch'>('cm');
  const [showHistory, setShowHistory] = useState(false);

  // State management
  const measurements = useMeasurementStore((state) => state.measurements);
  const isLoading = useMeasurementStore((state) => state.isLoading);
  const loadMeasurements = useMeasurementStore((state) => state.loadMeasurements);
  const deleteMeasurement = useMeasurementStore((state) => state.deleteMeasurement);
  const user = useUserStore((state) => state.user);

  useEffect(() => {
    loadMeasurements();
  }, []);

  useEffect(() => {
    if (user?.preferredUnit) {
      setUnit(user.preferredUnit);
    }
  }, [user]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Loading measurements...</Text>
      </View>
    );
  }

  // ============================================================
  // EMPTY STATE
  // ============================================================

  if (measurements.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyIcon}>📏</Text>
        <Text style={styles.emptyTitle}>No Measurements Yet</Text>
        <Text style={styles.emptySubtitle}>
          Take your first body scan to see your measurements here.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <Text style={styles.primaryButtonText}>📸 Start First Scan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // HISTORY VIEW
  // ============================================================

  if (showHistory) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Measurement History</Text>
          <Text style={styles.headerSubtitle}>
            {measurements.length} scan{measurements.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {[...measurements].reverse().map((m, index) => {
          const date = new Date(m.date);
          const accuracy = m.accuracy?.overallScore;
          return (
            <TouchableOpacity
              key={m.id}
              style={styles.historyCard}
              onPress={() => {
                setShowHistory(false);
                // Set it as the displayed measurement
                useMeasurementStore.getState().setCurrentMeasurement(m);
              }}
            >
              <View style={styles.historyLeft}>
                <Text style={styles.historyDate}>
                  {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.historyInfo}>
                  {m.accuracy?.anglesUsed?.length || '?'} angle(s)
                  {accuracy ? ` • ${accuracy}% accuracy` : ''}
                </Text>
              </View>
              <View style={styles.historyRight}>
                {accuracy && (
                  <Text style={[
                    styles.historyAccuracy,
                    accuracy >= 85 && { color: Theme.colors.success },
                    accuracy >= 70 && accuracy < 85 && { color: Theme.colors.warning },
                    accuracy < 70 && { color: Theme.colors.error },
                  ]}>
                    {accuracy}%
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Delete Scan',
                      `Delete scan from ${date.toLocaleDateString()}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => deleteMeasurement(m.id),
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.deleteIcon}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.outlineButton}
          onPress={() => setShowHistory(false)}
        >
          <Text style={styles.outlineButtonText}>← Back to Latest</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ============================================================
  // LATEST MEASUREMENT VIEW
  // ============================================================

  const latestMeasurement =
    useMeasurementStore.getState().currentMeasurement ||
    measurements[measurements.length - 1];

  const lastScanDate = latestMeasurement?.date
    ? new Date(latestMeasurement.date)
    : new Date();

  const measurementData = latestMeasurement.measurements;
  const accuracy = latestMeasurement.accuracy;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const convertToInch = (cm: number) => round1(cm / 2.54);

  const displayValue = (cm: number) => {
    return unit === 'cm' ? `${round1(cm)} cm` : `${convertToInch(cm)} in`;
  };

  const measurementList = [
    { label: 'Height', value: measurementData.height, icon: '📏' },
    { label: 'Weight', value: measurementData.weight, icon: '⚖️', isWeight: true },
    { label: 'Chest', value: measurementData.chest, icon: '👔' },
    { label: 'Waist', value: measurementData.waist, icon: '👖' },
    { label: 'Hips', value: measurementData.hips, icon: '🩳' },
    { label: 'Shoulders', value: measurementData.shoulders, icon: '👕' },
    { label: 'Neck', value: measurementData.neck, icon: '👔' },
    { label: 'Sleeve', value: measurementData.sleeve, icon: '🧥' },
    { label: 'Inseam', value: measurementData.inseam, icon: '👖' },
    { label: 'Thigh', value: measurementData.thigh, icon: '🦵' },
    { label: 'Calf', value: measurementData.calf, icon: '👟' },
  ].filter(m => m.value > 0); // Only show non-zero measurements

  // ============================================================
  // EXPORT
  // ============================================================

  const handleExport = async () => {
    const lines = [
      'Tailor-X Body Measurements',
      `Date: ${lastScanDate.toLocaleDateString()}`,
      accuracy ? `Accuracy: ${accuracy.overallScore}%` : '',
      '',
      ...measurementList.map(m =>
        m.isWeight
          ? `${m.label}: ${round1(m.value)} kg`
          : `${m.label}: ${displayValue(m.value)}`
      ),
    ].filter(Boolean);

    try {
      await Share.share({
        title: 'Tailor-X Measurements',
        message: lines.join('\n'),
      });
    } catch (e) {
      // User cancelled
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Measurements</Text>
        <Text style={styles.headerSubtitle}>
          Last scan: {lastScanDate.toLocaleDateString()}
        </Text>
      </View>

      {/* Accuracy banner */}
      {accuracy && (
        <View style={[
          styles.accuracyBanner,
          accuracy.overallScore >= 85 && { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
          accuracy.overallScore >= 70 && accuracy.overallScore < 85 && { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
          accuracy.overallScore >= 55 && accuracy.overallScore < 70 && { backgroundColor: '#FFEDD5', borderColor: '#F97316' },
          accuracy.overallScore < 55 && { backgroundColor: '#EDE9FE', borderColor: '#8B5CF6' },
        ]}>
          <Text style={styles.accuracyBannerText}>
            {accuracy.overallScore >= 85 ? '🎯' : accuracy.overallScore >= 70 ? '👍' : accuracy.overallScore >= 55 ? '📐' : '🔬'}{' '}
            {accuracy.overallScore}% accuracy — {accuracy.anglesUsed.length} angle(s)
          </Text>
          {accuracy.warnings.length > 0 && (
            <Text style={styles.accuracyWarning}>
              {accuracy.warnings[0]}
            </Text>
          )}
        </View>
      )}

      {/* Unit toggle */}
      <View style={styles.unitToggle}>
        <Text style={[styles.unitText, unit === 'cm' && styles.unitTextActive]}>
          CM
        </Text>
        <Switch
          value={unit === 'inch'}
          onValueChange={(value) => setUnit(value ? 'inch' : 'cm')}
          trackColor={{
            false: Theme.colors.primary,
            true: Theme.colors.secondary,
          }}
          thumbColor={Theme.colors.white}
        />
        <Text style={[styles.unitText, unit === 'inch' && styles.unitTextActive]}>
          INCH
        </Text>
      </View>

      {/* Measurement cards */}
      <View style={styles.measurementsContainer}>
        {measurementList.map((item, index) => {
          const conf = accuracy?.confidence?.[item.label.toLowerCase()];
          return (
            <View key={index} style={styles.measurementCard}>
              <View style={styles.measurementHeader}>
                <Text style={styles.measurementIcon}>{item.icon}</Text>
                <View>
                  <Text style={styles.measurementLabel}>{item.label}</Text>
                  {conf !== undefined && (
                    <Text style={[
                      styles.confidenceText,
                      conf >= 80 && { color: '#10B981' },
                      conf >= 60 && conf < 80 && { color: '#F59E0B' },
                      conf < 60 && { color: '#8B5CF6' },
                    ]}>
                      {conf >= 80 ? 'High' : conf >= 60 ? 'Medium' : 'Estimated'}
                    </Text>
                  )}
                </View>
              </View>
              <Text style={styles.measurementValue}>
                {item.isWeight
                  ? `${round1(item.value)} kg`
                  : displayValue(item.value)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Action buttons */}
      <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
        <Text style={styles.exportButtonText}>📤 Export Measurements</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => setShowHistory(true)}
      >
        <Text style={styles.historyButtonText}>
          📊 View History ({measurements.length} scan{measurements.length !== 1 ? 's' : ''})
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
  },
  loadingText: {
    marginTop: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Theme.spacing.md,
  },
  emptyTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.xl,
    paddingHorizontal: Theme.spacing.lg,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    ...Theme.shadows.medium,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  header: {
    padding: Theme.spacing.lg,
    backgroundColor: Theme.colors.white,
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
  },
  accuracyBanner: {
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    padding: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  accuracyBannerText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.medium,
    color: Theme.colors.text.primary,
  },
  accuracyWarning: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.secondary,
    marginTop: 4,
  },
  unitToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Theme.spacing.md,
    backgroundColor: Theme.colors.white,
    marginBottom: Theme.spacing.md,
    gap: Theme.spacing.md,
  },
  unitText: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.secondary,
  },
  unitTextActive: {
    color: Theme.colors.primary,
  },
  measurementsContainer: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.lg,
  },
  measurementCard: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  measurementHeader: {
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
  confidenceText: {
    fontSize: Theme.fontSize.xs,
    marginTop: 2,
  },
  measurementValue: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.primary,
  },
  exportButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    alignItems: 'center',
    ...Theme.shadows.medium,
  },
  exportButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  historyButton: {
    backgroundColor: Theme.colors.white,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.xxl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.primary,
  },
  historyButtonText: {
    color: Theme.colors.primary,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  // History view styles
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    ...Theme.shadows.small,
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.medium,
    color: Theme.colors.text.primary,
  },
  historyInfo: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    marginTop: 2,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  historyAccuracy: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
  },
  deleteIcon: {
    fontSize: 18,
  },
  outlineButton: {
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.xxl,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: Theme.colors.primary,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.medium,
  },
});
