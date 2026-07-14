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
  const routeInviteCode = route?.params?.inviteCode;
  const [inviteCode, setInviteCode] = useState(routeInviteCode || activeInviteCode || '');
  const [customerName, setCustomerName] = useState(
    getDisplayName(userProfile?.name || authUser?.displayName, authUser?.email || userProfile?.email, '')
  );
  const [customerEmail, setCustomerEmail] = useState(authUser?.email || userProfile?.email || '');
  const [invite, setInvite] = useState<InviteLookupResponse | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const isReadyForInviteScan = Boolean(authUser?.email && authUser.isOnboarded);

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
      await setActiveInvite(code, data.organization.brandName);
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
      <Text style={styles.title}>Branded Customer Scan</Text>
      <Text style={styles.subtitle}>Enter the invite code from the fashion house, tailor, or designer to start a licensed measurement session.</Text>
      {!isReadyForInviteScan ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Invite link loaded first</Text>
          <Text style={styles.noticeText}>
            Sign in and complete your fit profile. This invite code will stay on this device so your scan can report back to the tailor dashboard.
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>Invite code</Text>
      <TextInput style={styles.input} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" />
      <TouchableOpacity style={styles.secondaryButton} onPress={() => loadInvite()} disabled={isLoadingInvite}>
        <Text style={styles.secondaryButtonText}>{isLoadingInvite ? 'Loading invite...' : 'Load branded invite'}</Text>
      </TouchableOpacity>

      {invite ? (
        <View style={[styles.brandCard, { borderColor: invite.organization.primaryColor || Colors.primary }]}> 
          <Text style={styles.brandName}>{invite.organization.brandName}</Text>
          <Text style={styles.brandHeadline}>{invite.invite.landing_headline || invite.organization.imprint}</Text>
          <Text style={styles.brandQuota}>Quota left: {invite.quota.remainingQuota}</Text>
        </View>
      ) : null}

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

      <TouchableOpacity style={styles.primaryButton} onPress={startSession} disabled={isStarting}>
        {isStarting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryButtonText}>Start Licensed Scan</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.text.secondary, marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text.primary, marginBottom: 8 },
  input: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, color: Colors.text.primary },
  secondaryButton: { borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 18 },
  secondaryButtonText: { color: Colors.primary, fontWeight: '700' },
  primaryButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  brandCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 2, padding: 18, marginBottom: 18 },
  brandName: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, marginBottom: 6 },
  brandHeadline: { fontSize: 14, color: Colors.text.secondary, marginBottom: 10 },
  brandQuota: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  noticeCard: { backgroundColor: '#E0F7F5', borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(34, 197, 185, 0.25)' },
  noticeTitle: { color: Colors.text.primary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  noticeText: { color: Colors.text.secondary, fontSize: 13, lineHeight: 19 },
});
