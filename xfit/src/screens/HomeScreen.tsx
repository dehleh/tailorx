import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Theme } from '../constants/theme';

export default function HomeScreen({ navigation }: any) {
  const features = [
    {
      id: '1',
      title: 'Scan Your Body',
      description: 'Use AI-powered camera to capture accurate measurements',
      icon: '📸',
      action: () => navigation.navigate('Camera'),
    },
    {
      id: '2',
      title: 'View Measurements',
      description: 'Track your measurement history and progress',
      icon: '📏',
      action: () => navigation.navigate('Measurements'),
    },
    {
      id: '3',
      title: 'Your Profile',
      description: 'Manage your personal information and preferences',
      icon: '👤',
      action: () => navigation.navigate('Profile'),
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Tailor-X</Text>
        <Text style={styles.tagline}>Perfect Fit, Every Time</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Get Accurate Body Measurements</Text>
        <Text style={styles.heroSubtitle}>
          Using advanced AI technology to ensure the perfect fit for your clothing
        </Text>
      </View>

      <View style={styles.featuresContainer}>
        {features.map((feature) => (
          <TouchableOpacity
            key={feature.id}
            style={styles.featureCard}
            onPress={feature.action}
            activeOpacity={0.7}
          >
            <Text style={styles.featureIcon}>{feature.icon}</Text>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureDescription}>{feature.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate('Camera')}
      >
        <Text style={styles.primaryButtonText}>Start Scanning</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    paddingTop: Theme.spacing.xxl,
    paddingHorizontal: Theme.spacing.lg,
    alignItems: 'center',
    paddingBottom: Theme.spacing.lg,
  },
  logo: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.primary,
    marginBottom: Theme.spacing.xs,
  },
  tagline: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
  },
  hero: {
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.xl,
    backgroundColor: Theme.colors.white,
    marginBottom: Theme.spacing.lg,
  },
  heroTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.sm,
  },
  heroSubtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
    lineHeight: 24,
  },
  featuresContainer: {
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
  },
  featureCard: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.md,
    ...Theme.shadows.medium,
  },
  featureIcon: {
    fontSize: 40,
    marginBottom: Theme.spacing.sm,
  },
  featureTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xs,
  },
  featureDescription: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.xxl,
    alignItems: 'center',
    ...Theme.shadows.medium,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
  },
});
