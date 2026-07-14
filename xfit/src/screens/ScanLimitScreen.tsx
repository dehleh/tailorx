import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import BrandLogo from '../components/BrandLogo';

export default function ScanLimitScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BrandLogo style={styles.logo} />
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Free scan complete</Text>
          <Text style={styles.title}>Your free measurement scan has been used.</Text>
          <Text style={styles.subtitle}>
            You can still use Tailor-X for body type guidance, color blending, wardrobe culture,
            shopping advice, and style recommendations. To scan again, use a licensed invite link
            from a tailor or fashion house.
          </Text>
        </View>

        <View style={styles.optionCard}>
          <Text style={styles.optionTitle}>Have a tailor invite?</Text>
          <Text style={styles.optionText}>
            Enter the invite code or open the tailor link. Your next scan will be attached to their dashboard.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('EnterpriseInvite')}>
            <Text style={styles.primaryButtonText}>Use invite link</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.optionCard}>
          <Text style={styles.optionTitle}>Keep learning your fit</Text>
          <Text style={styles.optionText}>
            Read guides about body proportions, outfit choices, colors, wardrobe care, and smarter shopping.
          </Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('EducationHub')}>
            <Text style={styles.secondaryButtonText}>Open guides</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.homeButton} onPress={() => navigation.navigate('MainTabs')}>
          <Text style={styles.homeButtonText}>Back home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  logo: {
    width: 150,
    height: 36,
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: Colors.secondary,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 31,
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 21,
  },
  optionCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  optionTitle: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  optionText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#E0F7F5',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  homeButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  homeButtonText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
