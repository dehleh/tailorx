import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Linking } from 'react-native';
import { Colors } from '../constants/colors';
import { useAuthStore } from '../stores/authStore';
import BrandLogo from '../components/BrandLogo';

const PRIVACY_POLICY_URL = 'https://tailorxfit.com/privacy';

const privacyPoints = [
  {
    icon: 'LOCK',
    title: 'Protected Storage',
    description: 'Measurements and profile details are stored in device secure storage where supported.',
  },
  {
    icon: 'SHARE',
    title: 'You Control Sharing',
    description: 'Measurements are not shared unless you create a share link or send them to a tailor.',
  },
  {
    icon: 'CLOUD',
    title: 'Cloud Processing Notice',
    description: 'Scan photos may be sent to Tailor-X cloud processors for pose and contour analysis, then discarded after processing.',
  },
];

export default function PrivacyConsentScreen() {
  const { acceptPrivacy, completeOnboarding } = useAuthStore();

  const handleAccept = async () => {
    await acceptPrivacy();
    await completeOnboarding();
    // Navigator switches to MainTabs when isAuthenticated && isOnboarded becomes true.
  };

  const openPrivacyPolicy = async () => {
    await Linking.openURL(PRIVACY_POLICY_URL);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BrandLogo style={styles.headerLogo} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>Privacy</Text>
        </View>

        <Text style={styles.title}>Your Privacy Is Priority</Text>
        <Text style={styles.subtitle}>
          Review how scan data is handled before continuing.
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
            I understand that scan photos may be processed locally or by Tailor-X cloud services, that derived measurements are stored on my device, and that I control sharing.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.agreeButton} onPress={handleAccept} activeOpacity={0.8}>
          <Text style={styles.agreeButtonText}>Agree & Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openPrivacyPolicy}>
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
  headerLogo: {
    width: 142,
    height: 34,
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
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
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
    width: 48,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    marginTop: 2,
    paddingHorizontal: 6,
  },
  pointIcon: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
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
