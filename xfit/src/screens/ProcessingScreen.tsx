import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../constants/colors';

const funFacts = [
  'Did you know? We use AI to detect over 30 body landmarks for the most accurate measurements possible!',
  'Our scanning technology uses advanced pose estimation for precise results.',
  'Multi-angle scanning improves accuracy by up to 40% compared to single-angle.',
];

export default function ProcessingScreen({ route, navigation }: any) {
  const { result, accuracyReport } = route.params;
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'processing' | 'complete'>('processing');
  const [factIndex] = useState(() => Math.floor(Math.random() * funFacts.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 2;
      });
    }, 80);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100 && stage === 'processing') {
      setStage('complete');
      setTimeout(() => {
        navigation.replace('ScanResults', { result, accuracyReport });
      }, 1200);
    }
  }, [progress, stage, navigation, result, accuracyReport]);

  const remaining = Math.max(0, Math.ceil((100 - progress) / 25));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Circular indicator */}
        <View style={styles.circleWrapper}>
          <View style={[styles.circleOuter, stage === 'complete' && styles.circleComplete]}>
            <Text style={styles.circleIcon}>
              {stage === 'complete' ? '✅' : '⏳'}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>
          {stage === 'complete' ? 'Processing Complete' : 'Processing Your Scan'}
        </Text>
        <Text style={styles.subtitle}>
          {stage === 'complete' ? 'Finalizing results' : 'Calculating measurements...'}
        </Text>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressPercent}>{progress}% complete</Text>
            <Text style={styles.progressTime}>~{remaining}s remaining</Text>
          </View>
        </View>

        {/* Fun fact */}
        <View style={styles.factCard}>
          <Text style={styles.factIcon}>💡</Text>
          <Text style={styles.factText}>{funFacts[factIndex]}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  circleWrapper: {
    marginBottom: 24,
  },
  circleOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  circleComplete: {
    borderColor: Colors.success,
  },
  circleIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 32,
  },
  progressSection: {
    width: '100%',
    marginBottom: 40,
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressPercent: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  progressTime: {
    fontSize: 13,
    color: Colors.text.light,
  },
  factCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'flex-start',
  },
  factIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 2,
  },
  factText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
});
