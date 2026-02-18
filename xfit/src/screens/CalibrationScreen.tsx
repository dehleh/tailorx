/**
 * Calibration Screen
 * 
 * Allows the user to set up measurement calibration via:
 * 1. Known height (simplest, most common)
 * 2. Reference object (credit card, A4 paper, ruler)
 * 
 * Calibration is the single biggest accuracy improvement:
 * - Without: ±3-6cm error
 * - With:    ±1-2cm error
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Theme } from '../constants/theme';
import { useUserStore } from '../stores/userStore';
import { referenceCalibrationService, CalibrationResult } from '../services/referenceCalibration';
import { REFERENCE_SIZES } from '../services/measurementEngine';

interface CalibrationScreenProps {
  navigation: any;
  route?: {
    params?: {
      onComplete?: (calibration: CalibrationResult | null) => void;
    };
  };
}

export default function CalibrationScreen({ navigation, route }: CalibrationScreenProps) {
  const user = useUserStore((state) => state.user);
  const updateUser = useUserStore((state) => state.updateUser);

  const [method, setMethod] = useState<'height' | 'reference' | null>(null);
  const [heightInput, setHeightInput] = useState(user?.heightCm?.toString() || '');
  const [selectedRef, setSelectedRef] = useState<keyof typeof REFERENCE_SIZES>('credit_card');

  const onComplete = route?.params?.onComplete;

  // ============================================================
  // HEIGHT CALIBRATION
  // ============================================================

  const handleHeightCalibration = async () => {
    const height = parseFloat(heightInput);
    if (isNaN(height) || height < 50 || height > 250) {
      Alert.alert('Invalid Height', 'Please enter a valid height between 50 and 250 cm.');
      return;
    }

    // Save height to profile
    await updateUser({ heightCm: height });

    if (onComplete) {
      const calibration = referenceCalibrationService.createHeightCalibration(height, 0);
      onComplete(calibration);
    }

    Alert.alert(
      'Calibration Set ✅',
      `Your height (${height}cm) will be used as the calibration reference.\n\n` +
      'Expected accuracy: ±1-2cm for linear measurements.',
      [{ text: 'Continue', onPress: () => navigation.goBack() }]
    );
  };

  // ============================================================
  // REFERENCE OBJECT INFO
  // ============================================================

  const handleReferenceInfo = () => {
    const guide = referenceCalibrationService.getCalibrationGuide(selectedRef);

    Alert.alert(
      `📐 ${capitalize(selectedRef.replace('_', ' '))} Calibration`,
      `${guide.instructions.join('\n\n')}\n\n` +
      `💡 Tips:\n${guide.tips.join('\n')}`,
      [{ text: 'Got it' }]
    );
  };

  // ============================================================
  // SKIP
  // ============================================================

  const handleSkip = () => {
    Alert.alert(
      'Skip Calibration?',
      'Without calibration, measurements may have ±3-6cm error instead of ±1-2cm.\n\n' +
      'You can always set it up later in your Profile.',
      [
        { text: 'Go Back', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => {
            onComplete?.(null);
            navigation.goBack();
          },
        },
      ]
    );
  };

  // ============================================================
  // METHOD SELECTION VIEW
  // ============================================================

  if (!method) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>📐</Text>
          <Text style={styles.headerTitle}>Calibration Setup</Text>
          <Text style={styles.headerSubtitle}>
            Calibration converts pixels to real-world centimeters.{'\n'}
            This is the #1 factor for measurement accuracy.
          </Text>
        </View>

        <View style={styles.comparisonBox}>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonBad}>Without: ±3-6cm ❌</Text>
            <Text style={styles.comparisonGood}>With: ±1-2cm ✅</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose a method:</Text>

        <TouchableOpacity
          style={styles.methodCard}
          onPress={() => setMethod('height')}
        >
          <Text style={styles.methodIcon}>📏</Text>
          <View style={styles.methodContent}>
            <Text style={styles.methodTitle}>Known Height</Text>
            <Text style={styles.methodDesc}>
              Enter your height — simplest and most common method
            </Text>
            {user?.heightCm && (
              <Text style={styles.methodSaved}>
                ✅ Currently: {user.heightCm}cm
              </Text>
            )}
          </View>
          <Text style={styles.methodArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.methodCard}
          onPress={() => setMethod('reference')}
        >
          <Text style={styles.methodIcon}>💳</Text>
          <View style={styles.methodContent}>
            <Text style={styles.methodTitle}>Reference Object</Text>
            <Text style={styles.methodDesc}>
              Use a credit card, A4 paper, or ruler for precise scale
            </Text>
          </View>
          <Text style={styles.methodArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ============================================================
  // HEIGHT INPUT VIEW
  // ============================================================

  if (method === 'height') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>📏</Text>
          <Text style={styles.headerTitle}>Enter Your Height</Text>
          <Text style={styles.headerSubtitle}>
            We'll use your height as the primary scale reference during body scanning.
          </Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.fieldLabel}>Height (centimeters)</Text>
          <TextInput
            style={styles.heightInput}
            value={heightInput}
            onChangeText={setHeightInput}
            placeholder="e.g. 175"
            keyboardType="numeric"
            autoFocus
          />
          <Text style={styles.fieldHint}>
            Measure without shoes. Stand straight against a wall for best accuracy.
            If you know your height in feet/inches, convert: 5'10" = 178cm, 6'0" = 183cm
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, !heightInput && styles.primaryButtonDisabled]}
          onPress={handleHeightCalibration}
          disabled={!heightInput}
        >
          <Text style={styles.primaryButtonText}>Set Calibration</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setMethod(null)}
        >
          <Text style={styles.backText}>← Back to methods</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ============================================================
  // REFERENCE OBJECT VIEW
  // ============================================================

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>💳</Text>
        <Text style={styles.headerTitle}>Reference Object</Text>
        <Text style={styles.headerSubtitle}>
          Hold a known-size object in your scan photo. The system uses its dimensions
          to calculate exact pixel-to-cm scale.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Select reference type:</Text>

      {([
        { key: 'credit_card' as const, icon: '💳', name: 'Credit Card', size: '8.56 × 5.4 cm' },
        { key: 'a4_paper' as const, icon: '📄', name: 'A4 Paper', size: '21 × 29.7 cm' },
        { key: 'ruler' as const, icon: '📏', name: '30cm Ruler', size: '30 × 3 cm' },
      ]).map((ref) => (
        <TouchableOpacity
          key={ref.key}
          style={[
            styles.refCard,
            selectedRef === ref.key && styles.refCardActive,
          ]}
          onPress={() => setSelectedRef(ref.key)}
        >
          <Text style={styles.refIcon}>{ref.icon}</Text>
          <View style={styles.refContent}>
            <Text style={styles.refName}>{ref.name}</Text>
            <Text style={styles.refSize}>{ref.size}</Text>
          </View>
          {selectedRef === ref.key && (
            <Text style={styles.refCheck}>✓</Text>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.infoButton} onPress={handleReferenceInfo}>
        <Text style={styles.infoButtonText}>📖 How to use this reference</Text>
      </TouchableOpacity>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          ℹ️ During your body scan, hold the reference object flat against your body at waist level.
          The system will detect it and use its known dimensions for scale.
          {'\n\n'}
          Note: Auto-detection of reference objects is coming soon. For now, your known height
          provides the most reliable calibration.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => {
          Alert.alert(
            'Use Height Instead',
            'Reference object auto-detection is coming soon. For now, we recommend using your known height for calibration.',
            [
              { text: 'Enter Height', onPress: () => setMethod('height') },
              { text: 'OK', style: 'cancel' },
            ]
          );
        }}
      >
        <Text style={styles.primaryButtonText}>Set Up Reference</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setMethod(null)}
      >
        <Text style={styles.backText}>← Back to methods</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.lg,
    paddingTop: Theme.spacing.xl,
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: Theme.spacing.sm,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  comparisonBox: {
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    ...Theme.shadows.small,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  comparisonBad: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.error,
    fontWeight: Theme.fontWeight.semibold,
  },
  comparisonGood: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.success,
    fontWeight: Theme.fontWeight.semibold,
  },
  sectionTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    ...Theme.shadows.small,
  },
  methodIcon: {
    fontSize: 32,
    marginRight: Theme.spacing.md,
  },
  methodContent: {
    flex: 1,
  },
  methodTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
  },
  methodDesc: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    marginTop: 2,
  },
  methodSaved: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.success,
    marginTop: 4,
    fontWeight: Theme.fontWeight.medium,
  },
  methodArrow: {
    fontSize: 28,
    color: Theme.colors.text.light,
    marginLeft: Theme.spacing.sm,
  },
  skipButton: {
    alignItems: 'center',
    padding: Theme.spacing.lg,
  },
  skipText: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
  },
  inputSection: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
  },
  fieldLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
  },
  heightInput: {
    backgroundColor: Theme.colors.white,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md,
    fontSize: Theme.fontSize.xxl,
    color: Theme.colors.text.primary,
    textAlign: 'center',
    fontWeight: Theme.fontWeight.bold,
  },
  fieldHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.light,
    marginTop: Theme.spacing.sm,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    alignItems: 'center',
    ...Theme.shadows.medium,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
  },
  backButton: {
    alignItems: 'center',
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.xxl,
  },
  backText: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.primary,
  },
  refCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
  },
  refCardActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: '#F0ECFF',
  },
  refIcon: {
    fontSize: 28,
    marginRight: Theme.spacing.md,
  },
  refContent: {
    flex: 1,
  },
  refName: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
  },
  refSize: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    marginTop: 2,
  },
  refCheck: {
    fontSize: 20,
    color: Theme.colors.primary,
    fontWeight: Theme.fontWeight.bold,
  },
  infoButton: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.md,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  infoButtonText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.primary,
    fontWeight: Theme.fontWeight.medium,
  },
  noteBox: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  noteText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.secondary,
    lineHeight: 18,
  },
});
