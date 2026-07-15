import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';

export type EnterpriseStep = 'profile' | 'front' | 'side' | 'back' | 'review' | 'submit';

const steps: Array<{ key: EnterpriseStep; label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
  { key: 'review', label: 'Review' },
  { key: 'submit', label: 'Submit' },
];

type EnterpriseProgressStepperProps = {
  activeStep: EnterpriseStep;
  completedSteps?: EnterpriseStep[];
  compact?: boolean;
  tintColor?: string | null;
};

export default function EnterpriseProgressStepper({
  activeStep,
  completedSteps = [],
  compact = false,
  tintColor,
}: EnterpriseProgressStepperProps) {
  const activeIndex = steps.findIndex((step) => step.key === activeStep);
  const accent = tintColor || Colors.primary;

  return (
    <View style={[styles.wrapper, compact && styles.wrapperCompact]}>
      {steps.map((step, index) => {
        const isDone = completedSteps.includes(step.key) || index < activeIndex;
        const isActive = step.key === activeStep;

        return (
          <View key={step.key} style={styles.step}>
            <View
              style={[
                styles.dot,
                isDone && styles.dotDone,
                isActive && styles.dotActive,
                isActive && { borderColor: accent },
                isDone && { backgroundColor: accent, borderColor: accent },
              ]}
            >
              <Text style={[styles.dotText, (isDone || isActive) && styles.dotTextActive]}>
                {isDone ? '✓' : index + 1}
              </Text>
            </View>
            {!compact && (
              <Text
                style={[
                  styles.label,
                  isActive && styles.labelActive,
                  isDone && { color: accent },
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            )}
            {index < steps.length - 1 && (
              <View style={[styles.connector, isDone && { backgroundColor: accent }]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    rowGap: 6,
  },
  wrapperCompact: {
    paddingVertical: 0,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotActive: {
    borderWidth: 2,
    backgroundColor: Colors.white,
  },
  dotText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text.light,
  },
  dotTextActive: {
    color: Colors.secondary,
  },
  label: {
    maxWidth: 48,
    marginLeft: 5,
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.light,
  },
  labelActive: {
    color: Colors.text.primary,
  },
  connector: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 5,
  },
});
