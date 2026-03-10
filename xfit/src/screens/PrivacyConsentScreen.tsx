import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { Colors } from '../constants/colors';
import { useAuthStore } from '../stores/authStore';

const privacyPoints = [
  {
    icon: '🔐',
    title: 'Data Encryption',
    description: 'All measurements are encrypted and stored securely.',
  },
  {
    icon: '👁️',
    title: 'You Control Sharing',
    description: 'Only you can decide who sees your measurements.',
  },
  {
    icon: '🛡️',
    title: 'Privacy First',
    description: 'We never sell or share your data with third parties.',
  },
];

export default function PrivacyConsentScreen({ navigation }: any) {
  const { acceptPrivacy, completeOnboarding } = useAuthStore();

  const handleAccept = async () => {
    await acceptPrivacy();
    await completeOnboarding();
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Getting started</Text>
        <TouchableOpacity onPress={handleAccept}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>🛡️</Text>
        </View>

        <Text style={styles.title}>Your Privacy Is Priority</Text>
        <Text style={styles.subtitle}>
          Before we begin, here's how we protect your data
        </Text>

        <View style={styles.points}>
          {privacyPoints.map((p, i) => (
            <View key={i} style={styles.pointRow}>
              <View style={styles.pointDot}>
                <Text style={styles.pointIcon}>{p.icon}</Text>
              </View>
              <View style={styles.pointText}>
                <Text style={styles.pointTitle}>{p.title}</Text>
                <Text style={styles.pointDesc}>{p.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.consentBox}>
          <Text style={styles.consentText}>
            I understand that my data is processed securely and only I can share it. I consent to the scanning process.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.agreeButton} onPress={handleAccept} activeOpacity={0.8}>
          <Text style={styles.agreeButtonText}>Agree & Continue  ✓</Text>
        </TouchableOpacity>
        <TouchableOpacity>
          <Text style={styles.policyLink}>Read Full Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  points: {
    width: '100%',
    gap: 20,
    marginBottom: 28,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pointDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  pointIcon: {
    fontSize: 18,
  },
  pointText: {
    flex: 1,
  },
  pointTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  pointDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  consentBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
  },
  consentText: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  agreeButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  agreeButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  policyLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
});
