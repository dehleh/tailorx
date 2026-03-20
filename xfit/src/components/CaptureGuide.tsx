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
 * 
 * Layout is designed to sit below the top bar (~110px from top)
 * and above the bottom controls (~160px from bottom).
 */
export function CaptureGuide({ captureType, isReady }: CaptureGuideProps) {
  const guideConfig = GUIDE_CONFIGS[captureType];

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Instruction text — sits below the top bar progress indicator */}
      <View style={styles.instructionArea}>
        <Text style={styles.instructionText}>{guideConfig.instruction}</Text>
      </View>

      {/* Body outline guide — centered in available space */}
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

        {/* Alignment center line */}
        <View style={styles.centerLine} />
      </View>

      {/* Tips + status — compact area above the bottom controls */}
      <View style={styles.bottomSection}>
        <View style={styles.tipsContainer}>
          {guideConfig.tips.map((tip, index) => (
            <View key={index} style={styles.tipRow}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.statusBar, isReady ? styles.statusReady : styles.statusPending]}>
          <Text style={styles.statusText}>
            {isReady ? '✅ Ready to capture' : '⏳ Position your body in the guide'}
          </Text>
        </View>
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

const GUIDE_WIDTH = SCREEN_WIDTH * 0.75;
const GUIDE_HEIGHT = SCREEN_HEIGHT * 0.62;

// Reserve space for the top bar and bottom controls to prevent overlap
const TOP_RESERVED = 120;  // top bar height
const BOTTOM_RESERVED = 170; // bottom controls height

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    top: TOP_RESERVED,
    bottom: BOTTOM_RESERVED,
    justifyContent: 'space-between',
  },
  instructionArea: {
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
  },
  instructionText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.full,
    overflow: 'hidden',
  },
  outlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginVertical: 8,
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
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  bodyOutlineReady: {
    borderColor: Theme.colors.success,
  },
  headCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderStyle: 'dashed',
  },
  headCircleReady: {
    borderColor: Theme.colors.success,
  },
  bodyShape: {
    width: '68%',
    height: '42%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
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
    backgroundColor: 'rgba(255, 107, 157, 0.35)',
    marginHorizontal: 10,
  },
  waistLine: {
    height: 1,
    backgroundColor: 'rgba(78, 205, 196, 0.35)',
    marginHorizontal: 30,
  },
  hipLine: {
    height: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.35)',
    marginHorizontal: 20,
  },
  legsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 3,
  },
  leg: {
    width: 18,
    height: '26%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
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
    backgroundColor: 'rgba(107, 78, 255, 0.15)',
  },
  bottomSection: {
    paddingHorizontal: Theme.spacing.lg,
    gap: 8,
  },
  tipsContainer: {
    paddingHorizontal: Theme.spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  tipBullet: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.sm,
    marginRight: Theme.spacing.sm,
    opacity: 0.7,
  },
  tipText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.xs,
    opacity: 0.75,
  },
  statusBar: {
    paddingVertical: 10,
    paddingHorizontal: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.full,
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
