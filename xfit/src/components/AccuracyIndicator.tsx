import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Theme } from '../constants/theme';

interface AccuracyBadgeProps {
  accuracy: number; // 0-100
  size?: 'small' | 'medium' | 'large';
}

/**
 * Visual accuracy indicator badge
 */
export function AccuracyBadge({ accuracy, size = 'medium' }: AccuracyBadgeProps) {
  const { color, label, bgColor } = getAccuracyStyle(accuracy);
  const sizeStyle = SIZE_STYLES[size];

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, sizeStyle.container]}>
      <Text style={[styles.value, { color }, sizeStyle.value]}>{accuracy}%</Text>
      <Text style={[styles.label, { color }, sizeStyle.label]}>{label}</Text>
    </View>
  );
}

interface AccuracyReportCardProps {
  overallAccuracy: number;
  recommendations: string[];
  perMeasurement?: Record<string, { confidence: number; reliability: string }>;
  onImprove?: () => void;
}

/**
 * Detailed accuracy report card
 */
export function AccuracyReportCard({
  overallAccuracy,
  recommendations,
  perMeasurement,
  onImprove,
}: AccuracyReportCardProps) {
  const { color, label } = getAccuracyStyle(overallAccuracy);

  return (
    <View style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <View>
          <Text style={styles.reportTitle}>Accuracy Report</Text>
          <Text style={[styles.reportLabel, { color }]}>{label}</Text>
        </View>
        <AccuracyBadge accuracy={overallAccuracy} size="large" />
      </View>

      {recommendations.length > 0 && (
        <View style={styles.recommendationsSection}>
          <Text style={styles.sectionTitle}>💡 How to Improve</Text>
          {recommendations.map((rec, i) => (
            <View key={i} style={styles.recommendationRow}>
              <Text style={styles.recBullet}>→</Text>
              <Text style={styles.recText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}

      {perMeasurement && Object.keys(perMeasurement).length > 0 && (
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>📊 Breakdown</Text>
          {Object.entries(perMeasurement).map(([key, data]) => {
            const itemStyle = getAccuracyStyle(data.confidence);
            return (
              <View key={key} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Text>
                <View style={styles.breakdownBarContainer}>
                  <View
                    style={[
                      styles.breakdownBar,
                      {
                        width: `${data.confidence}%`,
                        backgroundColor: itemStyle.color,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.breakdownValue, { color: itemStyle.color }]}>
                  {data.confidence}%
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {onImprove && (
        <TouchableOpacity style={styles.improveButton} onPress={onImprove}>
          <Text style={styles.improveButtonText}>🎯 Improve Accuracy</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================
// HELPERS
// ============================================================

function getAccuracyStyle(accuracy: number) {
  if (accuracy >= 85) {
    return {
      color: Theme.colors.success,
      bgColor: '#D1FAE5',
      label: 'Excellent',
    };
  }
  if (accuracy >= 70) {
    return {
      color: Theme.colors.warning,
      bgColor: '#FEF3C7',
      label: 'Good',
    };
  }
  if (accuracy >= 55) {
    return {
      color: '#F97316',
      bgColor: '#FFEDD5',
      label: 'Fair',
    };
  }
  return {
    color: Theme.colors.error,
    bgColor: '#FEE2E2',
    label: 'Low',
  };
}

const SIZE_STYLES = {
  small: {
    container: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    value: { fontSize: 12, fontWeight: '700' as const },
    label: { fontSize: 9 },
  },
  medium: {
    container: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    value: { fontSize: 16, fontWeight: '700' as const },
    label: { fontSize: 11 },
  },
  large: {
    container: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
    value: { fontSize: 24, fontWeight: '700' as const },
    label: { fontSize: 12 },
  },
};

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontWeight: '700',
  },
  label: {
    fontWeight: '500',
    marginTop: 1,
  },
  reportCard: {
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.lg,
    ...Theme.shadows.medium,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
  },
  reportTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
  },
  reportLabel: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    marginTop: 2,
  },
  recommendationsSection: {
    marginBottom: Theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
  },
  recommendationRow: {
    flexDirection: 'row',
    paddingVertical: Theme.spacing.xs,
  },
  recBullet: {
    color: Theme.colors.primary,
    marginRight: Theme.spacing.sm,
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.bold,
  },
  recText: {
    flex: 1,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    lineHeight: 20,
  },
  breakdownSection: {
    marginBottom: Theme.spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  breakdownLabel: {
    width: 80,
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.secondary,
  },
  breakdownBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Theme.colors.border,
    borderRadius: 3,
    marginHorizontal: Theme.spacing.sm,
    overflow: 'hidden',
  },
  breakdownBar: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownValue: {
    width: 36,
    fontSize: Theme.fontSize.xs,
    fontWeight: Theme.fontWeight.semibold,
    textAlign: 'right',
  },
  improveButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  improveButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
});
