import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useUserStore } from '../stores/userStore';
import { useMeasurementStore } from '../stores/measurementStore';
import { useAuthStore } from '../stores/authStore';
import { useEnterpriseStore } from '../stores/enterpriseStore';
import { getDisplayName } from '../utils/displayName';

const WEB_ADMIN_URL = 'https://admin.tailorxfit.com';
const countryOptions = ['Nigeria', 'United States', 'United Kingdom', 'Ghana', 'South Africa'];
const styleOptions = ['classic', 'modern', 'business', 'traditional', 'modest', 'streetwear', 'minimal'] as const;
const colorOptions = ['neutral', 'warm', 'cool', 'bold', 'earth'] as const;

export default function ProfileScreen({ navigation }: any) {
  const user = useUserStore((state) => state.user);
  const loadUser = useUserStore((state) => state.loadUser);
  const setUser = useUserStore((state) => state.setUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const measurements = useMeasurementStore((state) => state.measurements);
  const authUser = useAuthStore((state) => state.user);
  const updateAuthUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);
  const organizationId = useEnterpriseStore((state) => state.organizationId);
  const organizationName = useEnterpriseStore((state) => state.organizationName);
  const clearEnterpriseContext = useEnterpriseStore((state) => state.clearContext);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>('other');
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editUnit, setEditUnit] = useState<'cm' | 'inch'>('cm');
  const [editCountry, setEditCountry] = useState('');
  const [editStyle, setEditStyle] = useState<(typeof styleOptions)[number]>('modern');
  const [editColor, setEditColor] = useState<(typeof colorOptions)[number]>('neutral');

  useEffect(() => {
    loadUser();
  }, []);

  // Create default profile on first launch
  useEffect(() => {
    if (user === null) {
      setUser({
        id: 'user_' + Date.now(),
        name: getDisplayName(undefined, authUser?.email, ''),
        email: authUser?.email || '',
        gender: 'other',
        preferredUnit: 'cm',
        country: '',
        preferredStyle: 'modern',
        colorPreference: 'neutral',
        createdAt: new Date(),
        measurementHistory: [],
      });
    }
  }, [authUser?.email, user]);

  const openEditModal = () => {
    setEditName(user?.name || getDisplayName(authUser?.displayName, authUser?.email, ''));
    setEditEmail(user?.email || authUser?.email || '');
    setEditGender(user?.gender || 'other');
    setEditHeight(user?.heightCm?.toString() || '');
    setEditWeight(user?.weightKg?.toString() || '');
    setEditUnit(user?.preferredUnit || 'cm');
    setEditCountry(user?.country || '');
    setEditStyle(user?.preferredStyle || 'modern');
    setEditColor(user?.colorPreference || 'neutral');
    setEditModalVisible(true);
  };

  const saveProfile = async () => {
    const heightNum = parseFloat(editHeight);
    const weightNum = parseFloat(editWeight);

    if (editHeight && (isNaN(heightNum) || heightNum < 50 || heightNum > 250)) {
      Alert.alert('Invalid Height', 'Please enter a height between 50 and 250 cm.');
      return;
    }
    if (editWeight && (isNaN(weightNum) || weightNum < 20 || weightNum > 300)) {
      Alert.alert('Invalid Weight', 'Please enter a weight between 20 and 300 kg.');
      return;
    }

    await updateUser({
      name: editName.trim() || getDisplayName(authUser?.displayName, authUser?.email),
      email: editEmail.trim(),
      gender: editGender,
      heightCm: editHeight ? heightNum : undefined,
      weightKg: editWeight ? weightNum : undefined,
      preferredUnit: editUnit,
      country: editCountry,
      preferredStyle: editStyle,
      colorPreference: editColor,
    });
    if (authUser) {
      await updateAuthUser({
        displayName: editName.trim() || getDisplayName(authUser?.displayName, authUser?.email),
        gender: editGender,
        heightCm: editHeight ? heightNum : undefined,
        weightKg: editWeight ? weightNum : undefined,
        preferredUnit: editUnit,
        country: editCountry,
        preferredStyle: editStyle,
        colorPreference: editColor,
      });
    }

    setEditModalVisible(false);
    Alert.alert('Profile Updated', 'Your profile has been saved.');
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will delete your profile and all measurements. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearUser();
            Alert.alert('Done', 'All data has been reset.');
          },
        },
      ]
    );
  };

  const openAdminPortal = async () => {
    const url = organizationId
      ? `${WEB_ADMIN_URL}/dashboard?org=${organizationId}`
      : `${WEB_ADMIN_URL}/login`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open portal', `Open ${url} in your browser.`);
    }
  };

  const displayName = getDisplayName(authUser?.displayName || user?.name, authUser?.email, 'Set Up Profile');
  const initials = (displayName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const profileComplete =
    !!user?.name && !!user?.heightCm && !!user?.country && user?.gender !== 'other';

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{displayName}</Text>
        {authUser?.email ? <Text style={styles.userEmail}>{authUser.email}</Text> : null}
        {user?.email ? <Text style={styles.userEmail}>{user.email}</Text> : null}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{measurements.length}</Text>
            <Text style={styles.statLabel}>Scans</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {user?.heightCm ? `${user.heightCm} cm` : '—'}
            </Text>
            <Text style={styles.statLabel}>Height</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {user?.weightKg ? `${user.weightKg} kg` : '—'}
            </Text>
            <Text style={styles.statLabel}>Weight</Text>
          </View>
        </View>
      </View>

      {/* Profile completeness banner */}
      {!profileComplete && (
        <TouchableOpacity style={styles.completeBanner} onPress={openEditModal}>
          <Text style={styles.completeBannerIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.completeBannerTitle}>Complete Your Profile</Text>
            <Text style={styles.completeBannerText}>
              Add your height and fit profile to improve scan confidence.
            </Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Edit profile */}
      <TouchableOpacity style={styles.editProfileButton} onPress={openEditModal}>
        <Text style={styles.editProfileText}>✏️ Edit Profile</Text>
      </TouchableOpacity>

      {/* Info cards */}
      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Gender</Text>
          <Text style={styles.infoValue}>
            {user?.gender === 'male' ? '♂ Male' : user?.gender === 'female' ? '♀ Female' : 'Not set'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Unit Preference</Text>
          <Text style={styles.infoValue}>
            {user?.preferredUnit === 'cm' ? 'Centimeters (cm)' : 'Inches (in)'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Member Since</Text>
          <Text style={styles.infoValue}>{joinDate || '—'}</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Country</Text>
          <Text style={styles.infoValue}>{user?.country || 'Not set'}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Style</Text>
          <Text style={styles.infoValue}>{user?.preferredStyle || 'Not set'}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Colors</Text>
          <Text style={styles.infoValue}>{user?.colorPreference || 'Not set'}</Text>
        </View>
      </View>

      <View style={styles.enterpriseSection}>
        <Text style={styles.enterpriseSectionTitle}>Enterprise Tools</Text>
        <View style={styles.enterpriseNotice}>
          <Text style={styles.enterpriseNoticeTitle}>Organization setup is admin-only</Text>
          <Text style={styles.enterpriseNoticeText}>
            Tailor and fashion-house workspaces are created from the super admin web dashboard.
          </Text>
        </View>
        <TouchableOpacity style={styles.enterpriseButton} onPress={openAdminPortal}>
          <Text style={styles.enterpriseButtonText}>
            🌐 Open Admin Web Portal{organizationName ? ` (${organizationName})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.enterpriseButton} onPress={() => navigation.navigate('EnterpriseInvite')}>
          <Text style={styles.enterpriseButtonText}>🔗 Open Branded Invite Flow</Text>
        </TouchableOpacity>
        {organizationId ? (
          <TouchableOpacity
            style={styles.enterpriseResetButton}
            onPress={async () => {
              await clearEnterpriseContext();
              Alert.alert('Enterprise context cleared', 'The active organization and invite session have been removed from this device.');
            }}
          >
            <Text style={styles.enterpriseResetText}>Clear enterprise context</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Danger zone */}
      <TouchableOpacity style={styles.resetButton} onPress={handleResetData}>
        <Text style={styles.resetText}>🗑️ Reset All Data</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={() => {
        Alert.alert('Log Out', 'Are you sure you want to log out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: () => logout() },
        ]);
      }}>
        <Text style={styles.logoutText}>🚪 Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>Tailor-X v1.0.0</Text>

      {/* ============================================================ */}
      {/* EDIT PROFILE MODAL */}
      {/* ============================================================ */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={saveProfile}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Name */}
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              autoCapitalize="words"
            />

            {/* Email */}
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.textInput}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Gender */}
            <Text style={styles.fieldLabel}>Gender (affects measurement calibration)</Text>
            <View style={styles.genderRow}>
              {(['male', 'female', 'other'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderOption,
                    editGender === g && styles.genderOptionActive,
                  ]}
                  onPress={() => setEditGender(g)}
                >
                  <Text
                    style={[
                      styles.genderOptionText,
                      editGender === g && styles.genderOptionTextActive,
                    ]}
                  >
                    {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⚪ Other'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Height */}
            <Text style={styles.fieldLabel}>Height (cm) - important for calibration</Text>
            <TextInput
              style={styles.textInput}
              value={editHeight}
              onChangeText={setEditHeight}
              placeholder="e.g. 175"
              keyboardType="numeric"
            />
            <Text style={styles.fieldHint}>
              Your height is the primary calibration reference and helps the engine convert pixels into centimeters.
            </Text>

            {/* Weight */}
            <Text style={styles.fieldLabel}>Weight (kg)</Text>
            <TextInput
              style={styles.textInput}
              value={editWeight}
              onChangeText={setEditWeight}
              placeholder="e.g. 70"
              keyboardType="numeric"
            />

            {/* Unit */}
            <Text style={styles.fieldLabel}>Preferred Unit</Text>
            <View style={styles.genderRow}>
              {(['cm', 'inch'] as const).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.genderOption,
                    editUnit === u && styles.genderOptionActive,
                  ]}
                  onPress={() => setEditUnit(u)}
                >
                  <Text
                    style={[
                      styles.genderOptionText,
                      editUnit === u && styles.genderOptionTextActive,
                    ]}
                  >
                    {u === 'cm' ? '📏 Centimeters' : '📐 Inches'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Country</Text>
            <View style={styles.chipWrap}>
              {countryOptions.map((country) => (
                <TouchableOpacity
                  key={country}
                  style={[styles.profileChip, editCountry === country && styles.profileChipActive]}
                  onPress={() => setEditCountry(country)}
                >
                  <Text style={[styles.profileChipText, editCountry === country && styles.profileChipTextActive]}>
                    {country}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Preferred style</Text>
            <View style={styles.chipWrap}>
              {styleOptions.map((style) => (
                <TouchableOpacity
                  key={style}
                  style={[styles.profileChip, editStyle === style && styles.profileChipActive]}
                  onPress={() => setEditStyle(style)}
                >
                  <Text style={[styles.profileChipText, editStyle === style && styles.profileChipTextActive]}>
                    {style}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Color preference</Text>
            <View style={styles.chipWrap}>
              {colorOptions.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.profileChip, editColor === color && styles.profileChipActive]}
                  onPress={() => setEditColor(color)}
                >
                  <Text style={[styles.profileChipText, editColor === color && styles.profileChipTextActive]}>
                    {color}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  profileHeader: {
    backgroundColor: Colors.white,
    paddingTop: 48,
    paddingBottom: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.white,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 12,
    marginTop: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  completeBannerIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  completeBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  completeBannerText: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  editProfileButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  editProfileText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    marginHorizontal: 20,
    marginBottom: 20,
  },  enterpriseSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  enterpriseSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  enterpriseNotice: {
    backgroundColor: '#E0F7F5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 185, 0.25)',
  },
  enterpriseNoticeTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  enterpriseNoticeText: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  enterpriseButton: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  enterpriseButtonText: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  enterpriseResetButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  enterpriseResetText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },  infoCard: {
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  resetButton: {
    backgroundColor: Colors.white,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.error,
  },
  resetText: {
    color: Colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: Colors.white,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  logoutText: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  menuArrow: {
    fontSize: 28,
    color: Colors.text.light,
    marginLeft: 8,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.text.light,
    paddingVertical: 20,
    paddingBottom: 80,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: {
    fontSize: 15,
    color: Colors.text.secondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  modalSave: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalBody: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
    marginTop: 14,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.text.light,
    marginTop: 4,
    lineHeight: 16,
  },
  textInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text.primary,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  genderOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: '#E6FAF8',
  },
  genderOptionText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  genderOptionTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileChip: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  profileChipText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  profileChipTextActive: {
    color: Colors.white,
  },
});
