import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import EnterpriseProgressStepper from '../components/EnterpriseProgressStepper';
import { useUserStore } from '../stores/userStore';
import { useMeasurementStore } from '../stores/measurementStore';
import { useEnterpriseStore } from '../stores/enterpriseStore';
import { useAuthStore } from '../stores/authStore';

interface CheckItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  hint: string;
  hintColor: string;
  checked: boolean;
}

const initialItems: CheckItem[] = [
  {
    id: 'clothing',
    icon: '👕',
    title: 'Wear fitted clothing',
    description: 'Tight-fitting clothes or undergarments work best',
    hint: 'Avoid baggy or loose clothing',
    hintColor: Colors.error,
    checked: false,
  },
  {
    id: 'space',
    icon: '📏',
    title: 'Clear space around you',
    description: 'At least 2 meters (6 feet) of open space',
    hint: 'Move furniture if needed',
    hintColor: Colors.primary,
    checked: false,
  },
  {
    id: 'lighting',
    icon: '💡',
    title: 'Good lighting',
    description: 'Well-lit room with even lighting',
    hint: 'Natural light or bright indoor lights',
    hintColor: Colors.primary,
    checked: false,
  },
  {
    id: 'battery',
    icon: '🔋',
    title: 'Phone battery',
    description: 'At least 20% battery recommended',
    hint: 'Scanning takes about 2 minutes',
    hintColor: Colors.primary,
    checked: false,
  },
  {
    id: 'angles',
    icon: '2',
    title: 'Front and side views',
    description: 'Both angles are required for circumference measurements',
    hint: 'Side view gives depth for chest, waist, hips, thigh, and calf',
    hintColor: Colors.primary,
    checked: false,
  },
  {
    id: 'review',
    icon: 'OK',
    title: 'Review before submit',
    description: 'Check confidence and warnings before sending to a tailor',
    hint: 'Enterprise scans are submitted after your review',
    hintColor: Colors.success,
    checked: false,
  },
];

export default function PreparationChecklistScreen({ navigation }: any) {
  const [items, setItems] = useState(initialItems);
  const userProfile = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);
  const measurements = useMeasurementStore((s) => s.measurements);
  const authUser = useAuthStore((s) => s.user);
  const activeEnterpriseSessionId = useEnterpriseStore((s) => s.activeSessionId);
  const activeEnterpriseName = useEnterpriseStore((s) => s.organizationName);
  const activeInviteCode = useEnterpriseStore((s) => s.activeInviteCode);
  const activeCustomerName = useEnterpriseStore((s) => s.activeCustomerName);
  const organizationPrimaryColor = useEnterpriseStore((s) => s.organizationPrimaryColor);
  const [selectedGender, setSelectedGender] = useState<'male' | 'female' | 'other'>(
    (userProfile?.gender as 'male' | 'female' | 'other') || 'other'
  );
  const checkedCount = items.filter((i) => i.checked).length;
  const allChecked = checkedCount === items.length;
  const genderSelected = ['male', 'female', 'other'].includes(selectedGender);
  const freeScanUsed = measurements.some((m) => (m.source || 'free') === 'free');
  const canUseScanAccess = Boolean(activeEnterpriseSessionId) || !freeScanUsed;
  const isEnterpriseScan = Boolean(activeEnterpriseSessionId);
  const profileReady = Boolean(userProfile?.heightCm && userProfile?.name && (userProfile?.email || authUser?.email));
  const privacyReady = Boolean(authUser?.isPrivacyAccepted);
  const enterpriseReady = !isEnterpriseScan || (profileReady && privacyReady && activeEnterpriseSessionId);
  const canStart = allChecked && genderSelected && canUseScanAccess && enterpriseReady;
  const progress = Math.round((checkedCount / items.length) * 100);

  const rootNavigation = navigation.getParent()?.getParent?.() || navigation.getParent?.() || navigation;
  const startButtonLabel = !genderSelected
    ? 'Select Gender Above'
    : !canUseScanAccess
      ? 'Use Invite or View Guides'
      : !enterpriseReady
        ? 'Complete Enterprise Readiness'
        : !allChecked
          ? 'Complete Checklist First'
          : "I'm ready, Start Scan";

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  };

  const handleGenderSelect = (gender: 'male' | 'female' | 'other') => {
    setSelectedGender(gender);
    updateUser({ gender });
  };

  const handleStart = () => {
    if (!canUseScanAccess) {
      rootNavigation.navigate('ScanLimit');
      return;
    }

    navigation.navigate('Calibration');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← New Scan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>📋</Text>
        </View>

        <Text style={styles.title}>Preparation checklist</Text>
        <Text style={styles.subtitle}>Make sure you're ready for the best scanning experience</Text>

        {isEnterpriseScan ? (
          <View style={[styles.enterpriseCard, organizationPrimaryColor ? { borderColor: organizationPrimaryColor } : null]}>
            <Text style={styles.enterpriseEyebrow}>Licensed client scan</Text>
            <Text style={styles.enterpriseTitle}>Scanning for {activeEnterpriseName || 'your fashion house'}</Text>
            <Text style={styles.enterpriseText}>
              {activeCustomerName || 'Client'} will review the measurement summary before it is sent to the tailor dashboard.
            </Text>
            <EnterpriseProgressStepper
              activeStep="profile"
              completedSteps={profileReady && privacyReady ? ['profile'] : []}
              tintColor={organizationPrimaryColor}
            />
            <View style={styles.readinessGrid}>
              <Text style={[styles.readinessPill, profileReady && styles.readinessPillOk]}>
                Profile {profileReady ? 'ready' : 'incomplete'}
              </Text>
              <Text style={[styles.readinessPill, privacyReady && styles.readinessPillOk]}>
                Privacy {privacyReady ? 'accepted' : 'required'}
              </Text>
              <Text style={[styles.readinessPill, activeInviteCode && styles.readinessPillOk]}>
                Invite {activeInviteCode ? 'linked' : 'missing'}
              </Text>
            </View>
          </View>
        ) : null}

        {!canUseScanAccess ? (
          <View style={styles.accessCard}>
            <Text style={styles.accessTitle}>Free scan used</Text>
            <Text style={styles.accessText}>
              Use a tailor invite for another scan, or continue with fit and style guidance.
            </Text>
            <View style={styles.accessActions}>
              <TouchableOpacity style={styles.accessButton} onPress={() => rootNavigation.navigate('EducationHub')}>
                <Text style={styles.accessButtonText}>View guides</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.accessButtonSecondary} onPress={() => rootNavigation.navigate('EnterpriseInvite')}>
                <Text style={styles.accessButtonSecondaryText}>Use invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Gender selector */}
        <View style={styles.genderSection}>
          <Text style={styles.genderLabel}>Select your fit profile *</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[styles.genderButton, selectedGender === 'male' && styles.genderButtonActive]}
              onPress={() => handleGenderSelect('male')}
              activeOpacity={0.7}
            >
              <Text style={styles.genderEmoji}>👨</Text>
              <Text style={[styles.genderText, selectedGender === 'male' && styles.genderTextActive]}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, selectedGender === 'female' && styles.genderButtonActive]}
              onPress={() => handleGenderSelect('female')}
              activeOpacity={0.7}
            >
              <Text style={styles.genderEmoji}>👩</Text>
              <Text style={[styles.genderText, selectedGender === 'female' && styles.genderTextActive]}>Female</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, selectedGender === 'other' && styles.genderButtonActive]}
              onPress={() => handleGenderSelect('other')}
              activeOpacity={0.7}
            >
              <Text style={styles.genderEmoji}>Fit</Text>
              <Text style={[styles.genderText, selectedGender === 'other' && styles.genderTextActive]}>Other</Text>
            </TouchableOpacity>
          </View>
          {!genderSelected && (
            <Text style={styles.genderHint}>Used to choose the closest body-measurement model</Text>
          )}
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            {checkedCount} of {items.length} ready
          </Text>
          <Text style={[styles.progressPercent, allChecked && { color: Colors.success }]}>
            {progress}%
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }, allChecked && { backgroundColor: Colors.success }]} />
        </View>

        {/* Checklist items */}
        <View style={styles.checklistItems}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.checkItem}
              onPress={() => toggleItem(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.checkItemLeft}>
                <View style={styles.itemIconCircle}>
                  <Text style={styles.itemIcon}>{item.icon}</Text>
                </View>
                <View style={styles.itemTextContent}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                  <Text style={[styles.itemHint, { color: item.hintColor }]}>{item.hint}</Text>
                </View>
              </View>
              <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                {item.checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          onPress={handleStart}
          activeOpacity={0.8}
          disabled={!canStart}
        >
          <Text style={styles.startButtonText}>{startButtonLabel}</Text>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  accessCard: {
    width: '100%',
    backgroundColor: '#E0F7F5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 185, 0.25)',
    padding: 16,
    marginBottom: 22,
  },
  accessTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  accessText: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 19,
    marginBottom: 14,
  },
  accessActions: {
    flexDirection: 'row',
    gap: 10,
  },
  accessButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  accessButtonText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  accessButtonSecondary: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accessButtonSecondaryText: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  enterpriseCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: 16,
    marginBottom: 22,
  },
  enterpriseEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  enterpriseTitle: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  enterpriseText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  readinessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  readinessPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  readinessPillOk: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
    color: '#047857',
  },
  genderSection: {
    width: '100%',
    marginBottom: 24,
  },
  genderLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 10,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 8,
  },
  genderButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: '#E0F7F5',
  },
  genderEmoji: {
    fontSize: 20,
  },
  genderText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  genderTextActive: {
    color: Colors.primary,
  },
  genderHint: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  checklistItems: {
    width: '100%',
    gap: 16,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  checkItemLeft: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 12,
  },
  itemIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemIcon: {
    fontSize: 20,
  },
  itemTextContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 3,
  },
  itemDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 3,
    lineHeight: 18,
  },
  itemHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.inputBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  checkboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  checkmark: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 90,
  },
  startButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: Colors.inputBorder,
  },
  startButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
