/**
 * Live Pose Feedback Component
 * 
 * Provides real-time visual feedback during camera capture:
 * - Body distance from camera (too close / too far)
 * - Posture validation (slouch, arms too close)
 * - Full body visibility check
 * - Auto-ready indicator when pose is optimal
 * 
 * Works with landmarks extracted from a quick preview frame analysis
 * or pose detection result.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Theme } from '../constants/theme';
import { Landmark } from '../services/measurementEngine';

export interface PoseFeedbackState {
  isFullBodyVisible: boolean;
  isGoodDistance: boolean;
  isGoodPosture: boolean;
  isArmsCorrect: boolean;
  isCentered: boolean;
  overallReady: boolean;
  issues: string[];
}

interface LivePoseFeedbackProps {
  landmarks: Landmark[] | null;
  imageWidth: number;
  imageHeight: number;
  captureType: 'front' | 'side' | 'back';
}

/**
 * Analyze landmarks and produce feedback for the user.
 * Can be called externally to get just the data without the UI component.
 */
export function analyzePose(
  landmarks: Landmark[],
  imageWidth: number,
  imageHeight: number,
  captureType: 'front' | 'side' | 'back'
): PoseFeedbackState {
  const issues: string[] = [];

  // --- Full Body Visibility ---
  const nose = landmarks.find(l => l.name === 'nose');
  const leftAnkle = landmarks.find(l => l.name === 'left_ankle');
  const rightAnkle = landmarks.find(l => l.name === 'right_ankle');
  const leftShoulder = landmarks.find(l => l.name === 'left_shoulder');
  const rightShoulder = landmarks.find(l => l.name === 'right_shoulder');
  const leftHip = landmarks.find(l => l.name === 'left_hip');
  const rightHip = landmarks.find(l => l.name === 'right_hip');
  const leftWrist = landmarks.find(l => l.name === 'left_wrist');
  const rightWrist = landmarks.find(l => l.name === 'right_wrist');

  const keyLandmarks = [nose, leftAnkle, rightAnkle, leftShoulder, rightShoulder, leftHip, rightHip];
  const visibleKeyLandmarks = keyLandmarks.filter(l => l && l.visibility > 0.4);
  const isFullBodyVisible = visibleKeyLandmarks.length >= 6;

  if (!isFullBodyVisible) {
    issues.push('Ensure full body is visible head to toe');
  }

  // --- Distance Check ---
  // Body should occupy roughly 40-80% of the frame height
  let isGoodDistance = true;
  if (nose && leftAnkle && rightAnkle) {
    const topY = nose.y;
    const bottomY = Math.max(leftAnkle.y, rightAnkle.y);
    const bodyRatio = bottomY - topY;

    if (bodyRatio > 0.88) {
      isGoodDistance = false;
      issues.push('Step back — you are too close to the camera');
    } else if (bodyRatio < 0.35) {
      isGoodDistance = false;
      issues.push('Step closer — you are too far from the camera');
    }
  }

  // --- Centering ---
  let isCentered = true;
  if (leftHip && rightHip) {
    const centerX = (leftHip.x + rightHip.x) / 2;
    if (centerX < 0.3 || centerX > 0.7) {
      isCentered = false;
      issues.push('Move to the center of the frame');
    }
  }

  // --- Posture Check (front view) ---
  let isGoodPosture = true;
  if (captureType === 'front' && leftShoulder && rightShoulder) {
    // Shoulders should be roughly level (< 3% height difference)
    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderTilt > 0.03) {
      isGoodPosture = false;
      issues.push('Stand straight — shoulders are uneven');
    }
  }

  // --- Arms Position ---
  let isArmsCorrect = true;
  if (captureType === 'front' && leftWrist && rightWrist && leftHip && rightHip) {
    // Arms should be slightly away from body for accurate width measurement
    const leftArmGap = Math.abs(leftWrist.x - leftHip.x);
    const rightArmGap = Math.abs(rightWrist.x - rightHip.x);

    if (leftArmGap < 0.02 || rightArmGap < 0.02) {
      isArmsCorrect = false;
      issues.push('Move arms slightly away from your body');
    }
  }

  const overallReady = isFullBodyVisible && isGoodDistance && isGoodPosture && isArmsCorrect && isCentered;

  return {
    isFullBodyVisible,
    isGoodDistance,
    isGoodPosture,
    isArmsCorrect,
    isCentered,
    overallReady,
    issues,
  };
}

/**
 * Real-time pose feedback overlay for the camera view.
 */
export function LivePoseFeedback({ landmarks, imageWidth, imageHeight, captureType }: LivePoseFeedbackProps) {
  const [feedback, setFeedback] = useState<PoseFeedbackState | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (!landmarks || landmarks.length === 0) {
      setFeedback(null);
      return;
    }
    setFeedback(analyzePose(landmarks, imageWidth, imageHeight, captureType));
  }, [landmarks, imageWidth, imageHeight, captureType]);

  useEffect(() => {
    if (feedback?.overallReady) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [feedback?.overallReady]);

  if (!feedback) {
    return (
      <View style={styles.container} pointerEvents="none">
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>Detecting pose...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Checklist */}
      <View style={styles.checkList}>
        <CheckItem label="Full body visible" ok={feedback.isFullBodyVisible} />
        <CheckItem label="Good distance" ok={feedback.isGoodDistance} />
        <CheckItem label="Centered" ok={feedback.isCentered} />
        <CheckItem label="Good posture" ok={feedback.isGoodPosture} />
        <CheckItem label="Arms position" ok={feedback.isArmsCorrect} />
      </View>

      {/* Issue banner */}
      {feedback.issues.length > 0 && (
        <View style={styles.issueBanner}>
          <Text style={styles.issueText}>{feedback.issues[0]}</Text>
        </View>
      )}

      {/* Ready indicator */}
      {feedback.overallReady && (
        <Animated.View style={[styles.readyBanner, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.readyText}>✅ Perfect! Tap to capture</Text>
        </Animated.View>
      )}
    </View>
  );
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={styles.checkItem}>
      <Text style={[styles.checkIcon, ok ? styles.checkOk : styles.checkFail]}>
        {ok ? '✓' : '✗'}
      </Text>
      <Text style={[styles.checkLabel, ok ? styles.checkLabelOk : styles.checkLabelFail]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    bottom: 120,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  checkList: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-end',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  checkOk: {
    color: '#10B981',
  },
  checkFail: {
    color: '#F87171',
  },
  checkLabel: {
    fontSize: 12,
    marginLeft: 4,
  },
  checkLabelOk: {
    color: '#D1FAE5',
  },
  checkLabelFail: {
    color: '#FEE2E2',
  },
  issueBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  issueText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  readyBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  readyText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusBanner: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'center',
  },
  statusText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
});
