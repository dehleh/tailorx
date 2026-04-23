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

export default function EnterpriseInviteScreen({ navigation }: any) {
  const activeInviteCode = useEnterpriseStore((state) => state.activeInviteCode);
  const setActiveInvite = useEnterpriseStore((state) => state.setActiveInvite);
  const setActiveSession = useEnterpriseStore((state) => state.setActiveSession);
  const [inviteCode, setInviteCode] = useState(activeInviteCode || '');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [invite, setInvite] = useState<InviteLookupResponse | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (activeInviteCode) {
      setInviteCode(activeInviteCode);
    }
  }, [activeInviteCode]);

  const loadInvite = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Invite required', 'Paste or enter a branded invite code first.');
      return;
    }
    setIsLoadingInvite(true);
    try {
      const data = await enterpriseApi.getInvite(inviteCode.trim());
      setInvite(data);
      await setActiveInvite(inviteCode.trim(), data.organization.brandName);
    } catch (error: any) {
      Alert.alert('Invite not found', error?.response?.data?.detail || 'Could not load the branded invite.');
    } finally {
      setIsLoadingInvite(false);
    }
  };

  const startSession = async () => {
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

      <Text style={styles.label}>Invite code</Text>
      <TextInput style={styles.input} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" />
      <TouchableOpacity style={styles.secondaryButton} onPress={loadInvite} disabled={isLoadingInvite}>
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
});