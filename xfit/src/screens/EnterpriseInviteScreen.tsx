import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';
import BrandLogo from '../components/BrandLogo';
import EnterpriseProgressStepper from '../components/EnterpriseProgressStepper';
import { enterpriseApi } from '../services/enterpriseApi';
import { useEnterpriseStore } from '../stores/enterpriseStore';
import { InviteLookupResponse } from '../types/enterprise';
import { useAuthStore } from '../stores/authStore';
import { useUserStore } from '../stores/userStore';
import { getDisplayName } from '../utils/displayName';

export default function EnterpriseInviteScreen({ navigation, route }: any) {
  const authUser = useAuthStore((state) => state.user);
  const userProfile = useUserStore((state) => state.user);
  const activeInviteCode = useEnterpriseStore((state) => state.activeInviteCode);
  const setActiveInvite = useEnterpriseStore((state) => state.setActiveInvite);
  const setActiveSession = useEnterpriseStore((state) => state.setActiveSession);
  const lastSubmission = useEnterpriseStore((state) => state.lastSubmission);
  const routeInviteCode = route?.params?.inviteCode;
  const [inviteCode, setInviteCode] = useState(routeInviteCode || activeInviteCode || '');
  const [customerName, setCustomerName] = useState(
    getDisplayName(userProfile?.name || authUser?.displayName, authUser?.email || userProfile?.email, '')
  );
  const [customerEmail, setCustomerEmail] = useState(authUser?.email || userProfile?.email || '');
  const [occasion, setOccasion] = useState('');
  const [preferredFit, setPreferredFit] = useState('Regular');
  const [styleNotes, setStyleNotes] = useState('');
  const [invite, setInvite] = useState<InviteLookupResponse | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const profileReady = Boolean(
    authUser?.email &&
    authUser.isOnboarded &&
    authUser.isPrivacyAccepted &&
    customerName.trim() &&
    customerEmail.trim() &&
    (userProfile?.heightCm || authUser.heightCm) &&
    (userProfile?.gender || authUser.gender)
  );
  const brandName = invite?.organization.brandName || 'Your fashion house';
  const brandColor = invite?.organization.primaryColor || Colors.primary;
  const invitePurpose = invite?.invite.landing_headline || invite?.organization.imprint || 'Complete a secure remote fitting profile.';
  const fitOptions = ['Slim', 'Regular', 'Relaxed'];

  const loadInvite = async (codeOverride?: string) => {
    const code = (codeOverride || inviteCode).trim();
    if (!code) {
      Alert.alert('Invite required', 'Paste or enter a branded invite code first.');
      return;
    }
    setIsLoadingInvite(true);
    try {
      const data = await enterpriseApi.getInvite(code);
      setInvite(data);
      setInviteCode(code);
      await setActiveInvite(code, data.organization.brandName, {
        organizationPrimaryColor: data.organization.primaryColor,
        inviteLabel: data.invite.label,
        inviteHeadline: data.invite.landing_headline,
        inviteImprint: data.organization.imprint,
      });
    } catch (error: any) {
      Alert.alert('Invite not found', error?.response?.data?.detail || 'Could not load the branded invite.');
    } finally {
      setIsLoadingInvite(false);
    }
  };

  useEffect(() => {
    if (!customerName) {
      setCustomerName(getDisplayName(userProfile?.name || authUser?.displayName, authUser?.email || userProfile?.email, ''));
    }
    if (!customerEmail && (authUser?.email || userProfile?.email)) {
      setCustomerEmail(authUser?.email || userProfile?.email || '');
    }
  }, [authUser?.displayName, authUser?.email, customerEmail, customerName, userProfile?.email, userProfile?.name]);

  useEffect(() => {
    if (routeInviteCode) {
      setInviteCode(routeInviteCode);
      loadInvite(routeInviteCode);
    } else if (activeInviteCode) {
      setInviteCode(activeInviteCode);
    }
    // loadInvite intentionally not included; this effect should only react to incoming links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInviteCode, routeInviteCode]);

  const startSession = async () => {
    if (!authUser?.email) {
      Alert.alert('Sign in required', 'Sign in first, then this invite will stay ready for your scan.', [
        { text: 'Sign in', onPress: () => navigation.navigate('EmailAuth') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if (!authUser.isOnboarded) {
      Alert.alert('Complete your profile', 'Finish your fit profile and privacy consent before starting the tailor scan.', [
        { text: 'Continue setup', onPress: () => navigation.navigate('GettingStarted') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if (!authUser.isPrivacyAccepted) {
      Alert.alert('Privacy consent required', 'Accept the privacy policy before sharing a licensed scan with a fashion house.');
      return;
    }
    if (!invite) {
      Alert.alert('Load invite', 'Load the branded invite before starting the scan.');
      return;
    }
    if (!invite.quota.canStartSession) {
      Alert.alert('Quota exhausted', 'This organization has used its licensed scan allocation.');
      return;
    }
    if (!customerName.trim() || !customerEmail.trim()) {
      Alert.alert('Missing details', 'Customer name and email are required.');
      return;
    }

    setIsStarting(true);
    try {
      const session = await enterpriseApi.startInviteSession(invite.invite.code, {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        source: 'mobile_app',
      });
      await setActiveSession({
        sessionId: session.sessionId,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        organizationId: session.organizationId,
        occasion: occasion.trim() || null,
        preferredFit,
        styleNotes: styleNotes.trim() || null,
      });
      navigation.navigate('MainTabs', {
        screen: 'Scan',
        params: {
          screen: 'PreparationChecklist',
        },
      });
    } catch (error: any) {
      Alert.alert('Could not start session', error?.response?.data?.detail || 'Failed to start the enterprise scan session.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <BrandLogo variant="fullColour" style={styles.logo} />
        <Text style={styles.kicker}>Enterprise fitting portal</Text>
        <Text style={styles.title}>
          {invite ? `${brandName} invites you to complete your fitting profile` : 'Start a branded tailor scan'}
        </Text>
        <Text style={styles.subtitle}>
          {invite
            ? invitePurpose
            : 'Enter the invite code from your fashion house, designer, or tailor to start a licensed measurement session.'}
        </Text>
        <EnterpriseProgressStepper
          activeStep="profile"
          completedSteps={profileReady ? ['profile'] : []}
          tintColor={brandColor}
        />
      </View>

      {!profileReady ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Complete client readiness first</Text>
          <Text style={styles.noticeText}>
            We need sign-in, privacy consent, name, email, height, and fit profile before a measurement can be attached to the tailor dashboard.
          </Text>
        </View>
      ) : null}

      {lastSubmission ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Latest enterprise scan</Text>
          <Text style={styles.statusTitle}>
            {lastSubmission.status === 'upload_failed' ? 'Upload needs attention' : 'Submitted for tailor review'}
          </Text>
          <Text style={styles.statusText}>
            {lastSubmission.organizationName || 'Fashion house'} - {lastSubmission.message || 'Your derived measurements are linked to the tailor dashboard.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Invite code</Text>
        <TextInput
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          placeholder="e.g. vosak-29b101"
          placeholderTextColor={Colors.text.light}
        />
        <TouchableOpacity style={styles.secondaryButton} onPress={() => loadInvite()} disabled={isLoadingInvite}>
          <Text style={styles.secondaryButtonText}>{isLoadingInvite ? 'Loading invite...' : 'Load branded invite'}</Text>
        </TouchableOpacity>
      </View>

      {invite ? (
        <View style={[styles.brandCard, { borderColor: brandColor }]}>
          <View style={[styles.brandMark, { backgroundColor: brandColor }]}>
            <Text style={styles.brandMarkText}>{brandName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.brandEyebrow}>Scanning for</Text>
          <Text style={styles.brandName}>{brandName}</Text>
          <Text style={styles.brandHeadline}>{invitePurpose}</Text>
          <View style={styles.brandMetaRow}>
            <Text style={styles.brandMeta}>Invite: {invite.invite.label}</Text>
            <Text style={styles.brandMeta}>Quota left: {invite.quota.remainingQuota}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Client details</Text>
        <Text style={styles.label}>Customer name</Text>
        <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} />

        <Text style={styles.label}>Customer email</Text>
        <TextInput
          style={styles.input}
          value={customerEmail}
          onChangeText={setCustomerEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.readinessGrid}>
          <Text style={[styles.readinessPill, Boolean(authUser?.isPrivacyAccepted) && styles.readinessPillOk]}>
            Privacy {authUser?.isPrivacyAccepted ? 'accepted' : 'required'}
          </Text>
          <Text style={[styles.readinessPill, Boolean(userProfile?.heightCm || authUser?.heightCm) && styles.readinessPillOk]}>
            Height {(userProfile?.heightCm || authUser?.heightCm) ? 'set' : 'needed'}
          </Text>
          <Text style={[styles.readinessPill, Boolean(userProfile?.gender || authUser?.gender) && styles.readinessPillOk]}>
            Fit profile {(userProfile?.gender || authUser?.gender) ? 'set' : 'needed'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tailor instructions</Text>
        <Text style={styles.label}>Occasion or garment purpose</Text>
        <TextInput
          style={styles.input}
          value={occasion}
          onChangeText={setOccasion}
          placeholder="Wedding, office wear, native wear, uniform..."
          placeholderTextColor={Colors.text.light}
        />
        <Text style={styles.label}>Preferred fit</Text>
        <View style={styles.fitRow}>
          {fitOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.fitChip, preferredFit === option && styles.fitChipActive]}
              onPress={() => setPreferredFit(option)}
            >
              <Text style={[styles.fitChipText, preferredFit === option && styles.fitChipTextActive]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Notes for your tailor</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={styleNotes}
          onChangeText={setStyleNotes}
          placeholder="Mention style references, body concerns, or special instructions."
          placeholderTextColor={Colors.text.light}
          multiline
        />
      </View>

      <View style={styles.trustCard}>
        <Text style={styles.trustTitle}>What gets shared</Text>
        <Text style={styles.trustText}>Derived measurements, confidence signals, selected fit notes, and scan metadata are sent to the fashion house.</Text>
        <Text style={styles.trustText}>Captured photos are not included in the enterprise completion payload.</Text>
        <Text style={styles.trustText}>You will review the measurement summary before submitting it to the tailor dashboard.</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={startSession} disabled={isStarting}>
        {isStarting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryButtonText}>Start Licensed Scan</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 48 },
  hero: { marginBottom: 18 },
  logo: { width: 156, height: 38, marginBottom: 18 },
  kicker: { color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.text.secondary, marginBottom: 24, lineHeight: 20 },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.text.primary, marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text.primary, marginBottom: 8 },
  input: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, color: Colors.text.primary },
  secondaryButton: { borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 18 },
  secondaryButtonText: { color: Colors.primary, fontWeight: '700' },
  primaryButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  brandCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 2, padding: 18, marginBottom: 16 },
  brandMark: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brandMarkText: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  brandEyebrow: { fontSize: 11, color: Colors.text.light, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  brandName: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, marginBottom: 6 },
  brandHeadline: { fontSize: 14, color: Colors.text.secondary, marginBottom: 10 },
  brandMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  brandMeta: { backgroundColor: '#F8FAFC', borderRadius: 999, borderWidth: 1, borderColor: Colors.border, color: Colors.text.secondary, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 6 },
  noticeCard: { backgroundColor: '#E0F7F5', borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(34, 197, 185, 0.25)' },
  noticeTitle: { color: Colors.text.primary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  noticeText: { color: Colors.text.secondary, fontSize: 13, lineHeight: 19 },
  statusCard: { backgroundColor: '#FFF7ED', borderRadius: 14, borderWidth: 1, borderColor: '#FDBA74', padding: 14, marginBottom: 16 },
  statusLabel: { color: '#9A3412', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  statusTitle: { color: '#7C2D12', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  statusText: { color: '#9A3412', fontSize: 13, lineHeight: 19 },
  readinessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  readinessPill: { backgroundColor: '#F8FAFC', borderRadius: 999, borderWidth: 1, borderColor: Colors.border, color: Colors.text.secondary, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 6 },
  readinessPillOk: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0', color: '#047857' },
  fitRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  fitChip: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.white },
  fitChipActive: { backgroundColor: '#E0F7F5', borderColor: Colors.primary },
  fitChipText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '700' },
  fitChipTextActive: { color: Colors.primary },
  notesInput: { minHeight: 88, textAlignVertical: 'top' },
  trustCard: { backgroundColor: Colors.secondary, borderRadius: 16, padding: 16, marginBottom: 18 },
  trustTitle: { color: Colors.white, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  trustText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginBottom: 6 },
});
