import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Theme } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CaptureGuideProps {
  captureType: 'front' | 'side' | 'back';
  isReady: boolean;
}

/**
 * Visual overlay guide for body capture
 * Shows the outline and instructions for each capture angle
 */
export function CaptureGuide({ captureType, isReady }: CaptureGuideProps) {
  const guideConfig = GUIDE_CONFIGS[captureType];

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Top instruction area */}
      <View style={styles.topInstruction}>
        <View style={styles.instructionBadge}>
          <Text style={styles.badgeEmoji}>{guideConfig.emoji}</Text>
          <Text style={styles.badgeText}>{guideConfig.title}</Text>
        </View>
        <Text style={styles.instructionText}>{guideConfig.instruction}</Text>
      </View>

      {/* Body outline guide */}
      <View style={styles.outlineContainer}>
        <View style={[
          styles.bodyOutline,
          isReady ? styles.bodyOutlineReady : styles.bodyOutlinePending,
        ]}>
          {/* Head */}
          <View style={[styles.headCircle, isReady && styles.headCircleReady]} />
          
          {/* Body */}
          <View style={[styles.bodyShape, isReady && styles.bodyShapeReady]}>
            {captureType === 'front' && (
              <>
                <View style={styles.shoulderLine} />
                <View style={styles.waistLine} />
                <View style={styles.hipLine} />
              </>
            )}
          </View>

          {/* Legs */}
          <View style={styles.legsContainer}>
            <View style={[styles.leg, isReady && styles.legReady]} />
            <View style={[styles.leg, isReady && styles.legReady]} />
          </View>
        </View>

        {/* Alignment marks */}
        <View style={styles.centerLine} />
      </View>

      {/* Bottom tips */}
      <View style={styles.bottomTips}>
        {guideConfig.tips.map((tip, index) => (
          <View key={index} style={styles.tipRow}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      {/* Status indicator */}
      <View style={[styles.statusBar, isReady ? styles.statusReady : styles.statusPending]}>
        <Text style={styles.statusText}>
          {isReady ? '✅ Ready to capture' : '⏳ Position your body in the guide'}
        </Text>
      </View>
    </View>
  );
}

// ============================================================
// GUIDE CONFIGURATIONS
// ============================================================

const GUIDE_CONFIGS = {
  front: {
    emoji: '🧍',
    title: 'Front View',
    instruction: 'Face the camera with arms slightly apart',
    tips: [
      'Stand straight with feet shoulder-width apart',
      'Arms slightly away from body',
      'Look straight ahead',
    ],
  },
  side: {
    emoji: '🧍‍♂️',
    title: 'Side View',
    instruction: 'Turn 90° and stand sideways to camera',
    tips: [
      'Turn your left side towards the camera',
      'Keep arms relaxed at sides',
      'Stand straight, don\'t lean',
    ],
  },
  back: {
    emoji: '🔄',
    title: 'Back View',
    instruction: 'Turn around, back facing camera',
    tips: [
      'Face away from the camera',
      'Arms slightly away from body',
      'Stand in the same position as front view',
    ],
  },
};

// ============================================================
// STYLES
// ============================================================

const GUIDE_WIDTH = SCREEN_WIDTH * 0.55;
const GUIDE_HEIGHT = SCREEN_HEIGHT * 0.55;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topInstruction: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Theme.spacing.lg,
  },
  instructionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(107, 78, 255, 0.85)',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.full,
    marginBottom: Theme.spacing.sm,
  },
  badgeEmoji: {
    fontSize: 20,
    marginRight: Theme.spacing.sm,
  },
  badgeText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  instructionText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs,
    borderRadius: Theme.borderRadius.md,
  },
  outlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  bodyOutline: {
    width: GUIDE_WIDTH,
    height: GUIDE_HEIGHT,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Theme.borderRadius.lg,
    paddingTop: 10,
  },
  bodyOutlinePending: {
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  bodyOutlineReady: {
    borderColor: Theme.colors.success,
  },
  headCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderStyle: 'dashed',
  },
  headCircleReady: {
    borderColor: Theme.colors.success,
  },
  bodyShape: {
    width: '70%',
    height: '45%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    borderRadius: 20,
    marginTop: 5,
    justifyContent: 'space-evenly',
  },
  bodyShapeReady: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  shoulderLine: {
    height: 1,
    backgroundColor: 'rgba(255, 107, 157, 0.4)',
    marginHorizontal: 10,
  },
  waistLine: {
    height: 1,
    backgroundColor: 'rgba(78, 205, 196, 0.4)',
    marginHorizontal: 30,
  },
  hipLine: {
    height: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.4)',
    marginHorizontal: 20,
  },
  legsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    marginTop: 3,
  },
  leg: {
    width: 20,
    height: '28%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  legReady: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  centerLine: {
    position: 'absolute',
    width: 1,
    height: GUIDE_HEIGHT,
    backgroundColor: 'rgba(107, 78, 255, 0.2)',
  },
  bottomTips: {
    paddingHorizontal: Theme.spacing.xl,
    paddingBottom: Theme.spacing.md,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  tipBullet: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    marginRight: Theme.spacing.sm,
    opacity: 0.8,
  },
  tipText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.xs,
    opacity: 0.8,
  },
  statusBar: {
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: 120,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.85)',
  },
  statusReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.85)',
  },
  statusText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.semibold,
  },
});
