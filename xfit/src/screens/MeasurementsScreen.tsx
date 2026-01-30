import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Theme } from '../constants/theme';
import { useMeasurementStore } from '../stores/measurementStore';
import { useUserStore } from '../stores/userStore';

export default function MeasurementsScreen() {
  const [unit, setUnit] = useState<'cm' | 'inch'>('cm');
  
  // State management
  const measurements = useMeasurementStore((state) => state.measurements);
  const currentMeasurement = useMeasurementStore((state) => state.currentMeasurement);
  const isLoading = useMeasurementStore((state) => state.isLoading);
  const loadMeasurements = useMeasurementStore((state) => state.loadMeasurements);
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

  // Use most recent measurement or show placeholder
  const latestMeasurement = currentMeasurement || measurements[measurements.length - 1];
  const lastScanDate = latestMeasurement?.date ? new Date(latestMeasurement.date) : new Date();
  
  const measurementData = latestMeasurement?.measurements || {
    height: 175,
    weight: 70,
    chest: 95,
    waist: 80,
    hips: 95,
    shoulders: 45,
    neck: 38,
    sleeve: 60,
    inseam: 82,
    thigh: 55,
    calf: 38,
  };

  const convertToInch = (cm: number) => (cm / 2.54).toFixed(1);

  const displayValue = (cm: number) => {
    return unit === 'cm' ? `${cm} cm` : `${convertToInch(cm)} in`;
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
  ];

  if (!latestMeasurement) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>📏</Text>
        <Text style={styles.emptyTitle}>No Measurements Yet</Text>
        <Text style={styles.emptySubtitle}>Take your first scan to get started!</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Measurements</Text>
        <Text style={styles.lastScan}>
          Last scan: {lastScanDate.toLocaleDateString()}
        </Text>
      </View>

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

      <View style={styles.measurementsContainer}>
        {measurementList.map((item, index) => (
          <View key={index} style={styles.measurementCard}>
            <View style={styles.measurementHeader}>
              <Text style={styles.measurementIcon}>{item.icon}</Text>
              <Text style={styles.measurementLabel}>{item.label}</Text>
            </View>
            <Text style={styles.measurementValue}>
              {item.isWeight
                ? `${item.value} kg`
                : displayValue(item.value)}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.exportButton}>
        <Text style={styles.exportButtonText}>📤 Export Measurements</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.historyButton}>
        <Text style={styles.historyButtonText}>📊 View History</Text>
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
  emptyText: {
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
  },
  header: {
    padding: Theme.spacing.lg,
    backgroundColor: Theme.colors.white,
    marginBottom: Theme.spacing.md,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xs,
  },
  lastScan: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
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
  },
  measurementIcon: {
    fontSize: 24,
    marginRight: Theme.spacing.sm,
  },
  measurementLabel: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.medium,
    color: Theme.colors.text.primary,
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
});
