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
import { Colors } from '../constants/colors';
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
        <ActivityIndicator size="large" color={Colors.primary} />
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
                    accuracy >= 85 && { color: Colors.success },
                    accuracy >= 70 && accuracy < 85 && { color: Colors.warning },
                    accuracy < 70 && { color: Colors.error },
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
            false: Colors.primary,
            true: Colors.secondary,
          }}
          thumbColor={Colors.white}
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
    backgroundColor: Colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.text.secondary,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: Colors.white,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  accuracyBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accuracyBannerText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  accuracyWarning: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  unitToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: Colors.white,
    marginBottom: 12,
    gap: 14,
  },
  unitText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  unitTextActive: {
    color: Colors.primary,
  },
  measurementsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  measurementCard: {
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  measurementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  measurementIcon: {
    fontSize: 24,
  },
  measurementLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  confidenceText: {
    fontSize: 12,
    marginTop: 2,
  },
  measurementValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
  },
  exportButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
  },
  exportButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  historyButton: {
    backgroundColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 80,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  historyButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  historyInfo: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  historyAccuracy: {
    fontSize: 18,
    fontWeight: '700',
  },
  deleteIcon: {
    fontSize: 18,
  },
  outlineButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 80,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
});
