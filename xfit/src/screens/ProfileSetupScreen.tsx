import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import BrandLogo from '../components/BrandLogo';
import { useAuthStore } from '../stores/authStore';
import { useUserStore } from '../stores/userStore';
import { getDisplayName } from '../utils/displayName';

const genderOptions = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
] as const;

const unitOptions = [
  { value: 'cm', label: 'cm' },
  { value: 'inch', label: 'inch' },
] as const;

const countryOptions = ['Nigeria', 'United States', 'United Kingdom', 'Ghana', 'South Africa'];

const styleOptions = [
  { value: 'classic', label: 'Classic' },
  { value: 'modern', label: 'Modern' },
  { value: 'business', label: 'Business' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'modest', label: 'Modest' },
  { value: 'streetwear', label: 'Streetwear' },
  { value: 'minimal', label: 'Minimal' },
] as const;

const colorOptions = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'bold', label: 'Bold' },
  { value: 'earth', label: 'Earth' },
] as const;

export default function ProfileSetupScreen({ navigation }: any) {
  const authUser = useAuthStore((s) => s.user);
  const updateAuthUser = useAuthStore((s) => s.updateUser);
  const setUserProfile = useUserStore((s) => s.setUser);
  const existingProfile = useUserStore((s) => s.user);

  const initialName = useMemo(
    () => getDisplayName(authUser?.displayName || existingProfile?.name, authUser?.email || existingProfile?.email, ''),
    [authUser?.displayName, authUser?.email, existingProfile?.name, existingProfile?.email]
  );

  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(existingProfile?.gender || 'other');
  const [height, setHeight] = useState(existingProfile?.heightCm?.toString() || '');
  const [weight, setWeight] = useState(existingProfile?.weightKg?.toString() || '');
  const [unit, setUnit] = useState<'cm' | 'inch'>(existingProfile?.preferredUnit || 'cm');
  const [country, setCountry] = useState(existingProfile?.country || '');
  const [preferredStyle, setPreferredStyle] = useState<(typeof styleOptions)[number]['value']>(
    existingProfile?.preferredStyle || 'modern'
  );
  const [colorPreference, setColorPreference] = useState<(typeof colorOptions)[number]['value']>(
    existingProfile?.colorPreference || 'neutral'
  );
  const [isSaving, setIsSaving] = useState(false);

  const saveProfile = async () => {
    const displayName = name.trim();
    const heightCm = Number(height);
    const weightKg = weight.trim() ? Number(weight) : undefined;

    if (!displayName) {
      Alert.alert('Name required', 'Enter your name so your profile and dashboard feel personal.');
      return;
    }
    if (!country) {
      Alert.alert('Country required', 'Choose your country so units and style guidance can be localized.');
      return;
    }
    if (!heightCm || Number.isNaN(heightCm) || heightCm < 50 || heightCm > 250) {
      Alert.alert('Height required', 'Enter a valid height between 50 cm and 250 cm.');
      return;
    }
    if (weightKg !== undefined && (Number.isNaN(weightKg) || weightKg < 20 || weightKg > 300)) {
      Alert.alert('Check weight', 'Weight is optional, but if entered it should be between 20 kg and 300 kg.');
      return;
    }

    setIsSaving(true);
    try {
      const profile = {
        id: existingProfile?.id || authUser?.id || `user_${Date.now()}`,
        name: displayName,
        email: authUser?.email || existingProfile?.email || '',
        gender,
        heightCm,
        weightKg,
        preferredUnit: unit,
        country,
        preferredStyle,
        colorPreference,
        createdAt: existingProfile?.createdAt || new Date(),
        measurementHistory: existingProfile?.measurementHistory || [],
      };

      await setUserProfile(profile);
      if (authUser) {
        await updateAuthUser({
          displayName,
          gender,
          heightCm,
          weightKg,
          preferredUnit: unit,
          country,
          preferredStyle,
          colorPreference,
        });
      }
      navigation.navigate('PrivacyConsent');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BrandLogo style={styles.logo} />
        <Text style={styles.title}>Set up your fit profile</Text>
        <Text style={styles.subtitle}>
          These details improve scan calibration and power style guidance after your measurement.
        </Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={Colors.text.light}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Fit profile</Text>
        <View style={styles.segmentRow}>
          {genderOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.segment, gender === option.value && styles.segmentActive]}
              onPress={() => setGender(option.value)}
            >
              <Text style={[styles.segmentText, gender === option.value && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="175" />
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Weight (optional)</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="70" />
          </View>
        </View>

        <Text style={styles.label}>Preferred unit</Text>
        <View style={styles.segmentRow}>
          {unitOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.segment, unit === option.value && styles.segmentActive]}
              onPress={() => setUnit(option.value)}
            >
              <Text style={[styles.segmentText, unit === option.value && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Country</Text>
        <View style={styles.wrapRow}>
          {countryOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, country === option && styles.chipActive]}
              onPress={() => setCountry(option)}
            >
              <Text style={[styles.chipText, country === option && styles.chipTextActive]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Preferred style</Text>
        <View style={styles.wrapRow}>
          {styleOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, preferredStyle === option.value && styles.chipActive]}
              onPress={() => setPreferredStyle(option.value)}
            >
              <Text style={[styles.chipText, preferredStyle === option.value && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Color preference</Text>
        <View style={styles.wrapRow}>
          {colorOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, colorPreference === option.value && styles.chipActive]}
              onPress={() => setColorPreference(option.value)}
            >
              <Text style={[styles.chipText, colorPreference === option.value && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={isSaving}>
          <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Continue'}</Text>
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
    marginBottom: 22,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
  },
  label: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    color: Colors.text.primary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 16,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  segment: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#E0F7F5',
    borderColor: Colors.primary,
  },
  segmentText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: Colors.primary,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  chip: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  chipText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: Colors.white,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 8,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
