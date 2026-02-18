import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { Theme } from '../constants/theme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  subMessage?: string;
  progress?: number; // 0-100
}

/**
 * Full-screen loading overlay with progress indicator
 */
export function LoadingOverlay({
  visible,
  message = 'Processing...',
  subMessage,
  progress,
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
          
          <Text style={styles.message}>{message}</Text>
          
          {subMessage && (
            <Text style={styles.subMessage}>{subMessage}</Text>
          )}

          {progress !== undefined && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${Math.min(100, Math.max(0, progress))}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.xl,
    alignItems: 'center',
    marginHorizontal: Theme.spacing.xl,
    minWidth: 250,
    ...Theme.shadows.large,
  },
  message: {
    marginTop: Theme.spacing.md,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    textAlign: 'center',
  },
  subMessage: {
    marginTop: Theme.spacing.sm,
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Theme.spacing.md,
    width: '100%',
    gap: Theme.spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Theme.colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.primary,
    minWidth: 40,
    textAlign: 'right',
  },
});
