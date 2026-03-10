import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Colors } from '../constants/colors';

const features = [
  {
    icon: '📸',
    title: 'Camera-Based Scanning',
    description: 'Get accurate measurements using just your phone',
  },
  {
    icon: '🔒',
    title: 'Privacy First',
    description: 'Your data is secure and only you control who sees it',
  },
  {
    icon: '⚡',
    title: 'Quick & Easy',
    description: 'Complete your scan in under 2 minutes',
  },
];

export default function OnboardingScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoEmoji}>📏</Text>
            </View>
            <Text style={styles.logoText}>Tailor-Xfit</Text>
          </View>
          <Text style={styles.heroTitle}>Perfect fit, everytime</Text>
          <Text style={styles.heroSubtitle}>
            Get professional body measurements without visiting a tailor. All you need is your smartphone.
          </Text>
        </View>

        <View style={styles.features}>
          {features.map((f, i) => (
            <React.Fragment key={i}>
              <View style={styles.featureRow}>
                <View style={[styles.featureDot, { backgroundColor: i === 0 ? Colors.primary : i === 1 ? Colors.success : '#3B82F6' }]}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.description}</Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('PhoneAuth')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Get Started  →</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>No tailor needed · Free to use</Text>
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
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  header: {
    marginBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoEmoji: {
    fontSize: 18,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 12,
    lineHeight: 34,
  },
  heroSubtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    lineHeight: 22,
  },
  features: {
    gap: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  featureIcon: {
    fontSize: 18,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  footerNote: {
    fontSize: 13,
    color: Colors.text.light,
  },
});
