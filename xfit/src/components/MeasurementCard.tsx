import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Theme } from '../constants/theme';

interface MeasurementCardProps {
  label: string;
  value: number;
  unit: 'cm' | 'inch';
  icon: string;
  confidence?: number;
  isWeight?: boolean;
  onPress?: () => void;
}

/**
 * Reusable measurement display card with confidence indicator
 */
export function MeasurementCard({
  label,
  value,
  unit,
  icon,
  confidence,
  isWeight = false,
  onPress,
}: MeasurementCardProps) {
  const displayValue = isWeight
    ? `${value} kg`
    : unit === 'cm'
    ? `${value.toFixed(1)} cm`
    : `${(value / 2.54).toFixed(1)} in`;

  const confidenceColor = confidence
    ? confidence >= 85
      ? Theme.colors.success
      : confidence >= 70
      ? Theme.colors.warning
      : Theme.colors.error
    : undefined;

  const confidenceLabel = confidence
    ? confidence >= 85
      ? 'High'
      : confidence >= 70
      ? 'Medium'
      : 'Low'
    : undefined;

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={styles.card}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.leftSection}>
        <Text style={styles.icon}>{icon}</Text>
        <View>
          <Text style={styles.label}>{label}</Text>
          {confidenceLabel && (
            <View style={styles.confidenceRow}>
              <View
                style={[
                  styles.confidenceDot,
                  { backgroundColor: confidenceColor },
                ]}
              />
              <Text
                style={[
                  styles.confidenceText,
                  { color: confidenceColor },
                ]}
              >
                {confidenceLabel} ({confidence}%)
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.rightSection}>
        <Text style={styles.value}>{displayValue}</Text>
        {onPress && <Text style={styles.editIcon}>✏️</Text>}
      </View>
    </Container>
  );
}

// ============================================================
// Compact Measurement Row (for inline display)
// ============================================================

interface MeasurementRowProps {
  label: string;
  value: number;
  unit: 'cm' | 'inch';
  confidence?: number;
}

export function MeasurementRow({ label, value, unit, confidence }: MeasurementRowProps) {
  const displayValue = unit === 'cm'
    ? `${value.toFixed(1)} cm`
    : `${(value / 2.54).toFixed(1)} in`;

  return (
    <View style={rowStyles.container}>
      <Text style={rowStyles.label}>{label}</Text>
      <View style={rowStyles.valueContainer}>
        <Text style={rowStyles.value}>{displayValue}</Text>
        {confidence !== undefined && (
          <View
            style={[
              rowStyles.confidenceBar,
              {
                width: `${Math.min(100, confidence)}%`,
                backgroundColor:
                  confidence >= 85
                    ? Theme.colors.success
                    : confidence >= 70
                    ? Theme.colors.warning
                    : Theme.colors.error,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 24,
    marginRight: Theme.spacing.sm,
  },
  label: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.medium,
    color: Theme.colors.text.primary,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  confidenceText: {
    fontSize: Theme.fontSize.xs,
    fontWeight: Theme.fontWeight.medium,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.primary,
    marginRight: Theme.spacing.xs,
  },
  editIcon: {
    fontSize: 14,
  },
});

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  label: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    flex: 1,
  },
  valueContainer: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  value: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
  },
  confidenceBar: {
    height: 2,
    borderRadius: 1,
    marginTop: 3,
    minWidth: 20,
  },
});
