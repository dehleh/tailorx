import React, { useState } from 'react';
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

export default function EnterpriseSetupScreen({ navigation }: any) {
  const setBootstrapContext = useEnterpriseStore((state) => state.setBootstrapContext);
  const [organizationName, setOrganizationName] = useState('Acme Fashion House');
  const [brandName, setBrandName] = useState('Acme Couture');
  const [adminName, setAdminName] = useState('Operations Lead');
  const [adminEmail, setAdminEmail] = useState('ops@acmefashion.com');
  const [seats, setSeats] = useState('25');
  const [scanQuota, setScanQuota] = useState('2000');
  const [imprint, setImprint] = useState('Acme Atelier Remote Fitting');
  const [primaryColor, setPrimaryColor] = useState('#0F2B3C');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!organizationName.trim() || !adminName.trim() || !adminEmail.trim()) {
      Alert.alert('Missing details', 'Organization name, admin name, and admin email are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await enterpriseApi.bootstrapOrganization({
        organizationName: organizationName.trim(),
        brandName: brandName.trim() || organizationName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        seats: Number(seats) || 1,
        scanQuota: Number(scanQuota) || 100,
        imprint: imprint.trim() || undefined,
        primaryColor: primaryColor.trim() || '#0F2B3C',
      });
      await setBootstrapContext({ ...result, organizationName: organizationName.trim() });
      navigation.replace('OrganizationDashboard');
    } catch (error: any) {
      Alert.alert('Setup failed', error?.response?.data?.detail || 'Could not create the organization workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Enterprise Workspace Setup</Text>
      <Text style={styles.subtitle}>Provision an organization, its license, and the first branded invite link.</Text>

      <Text style={styles.label}>Organization Name</Text>
      <TextInput style={styles.input} value={organizationName} onChangeText={setOrganizationName} />

      <Text style={styles.label}>Brand Name</Text>
      <TextInput style={styles.input} value={brandName} onChangeText={setBrandName} />

      <Text style={styles.label}>Admin Name</Text>
      <TextInput style={styles.input} value={adminName} onChangeText={setAdminName} />

      <Text style={styles.label}>Admin Email</Text>
      <TextInput
        style={styles.input}
        value={adminEmail}
        onChangeText={setAdminEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Staff Seats</Text>
          <TextInput style={styles.input} value={seats} onChangeText={setSeats} keyboardType="numeric" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Scan Quota</Text>
          <TextInput style={styles.input} value={scanQuota} onChangeText={setScanQuota} keyboardType="numeric" />
        </View>
      </View>

      <Text style={styles.label}>Brand Imprint</Text>
      <TextInput style={styles.input} value={imprint} onChangeText={setImprint} />

      <Text style={styles.label}>Primary Color</Text>
      <TextInput style={styles.input} value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="none" />

      <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={isSubmitting}>
        {isSubmitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryButtonText}>Create Enterprise Workspace</Text>}
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
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    color: Colors.text.primary,
  },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  primaryButton: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});