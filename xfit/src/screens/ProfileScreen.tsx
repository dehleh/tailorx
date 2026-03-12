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
} from 'react-native';
import { Colors } from '../constants/colors';
import { useUserStore } from '../stores/userStore';
import { useMeasurementStore } from '../stores/measurementStore';
import { useAuthStore } from '../stores/authStore';

export default function ProfileScreen() {
  const user = useUserStore((state) => state.user);
  const loadUser = useUserStore((state) => state.loadUser);
  const setUser = useUserStore((state) => state.setUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const measurements = useMeasurementStore((state) => state.measurements);
  const authUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>('other');
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editUnit, setEditUnit] = useState<'cm' | 'inch'>('cm');

  useEffect(() => {
    loadUser();
  }, []);

  // Create default profile on first launch
  useEffect(() => {
    if (user === null) {
      setUser({
        id: 'user_' + Date.now(),
        name: '',
        email: '',
        gender: 'other',
        preferredUnit: 'cm',
        createdAt: new Date(),
        measurementHistory: [],
      });
    }
  }, [user]);

  const openEditModal = () => {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setEditGender(user?.gender || 'other');
    setEditHeight(user?.heightCm?.toString() || '');
    setEditWeight(user?.weightKg?.toString() || '');
    setEditUnit(user?.preferredUnit || 'cm');
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
      name: editName.trim() || 'User',
      email: editEmail.trim(),
      gender: editGender,
      heightCm: editHeight ? heightNum : undefined,
      weightKg: editWeight ? weightNum : undefined,
      preferredUnit: editUnit,
    });

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

  const displayName = authUser?.displayName || user?.name || 'Set Up Profile';
  const initials = (authUser?.displayName || user?.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const profileComplete =
    !!user?.name && !!user?.heightCm && user?.gender !== 'other';

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
              Add your height and gender for more accurate measurements (±1-2cm vs ±5cm)
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
            <Text style={styles.fieldLabel}>Height (cm) — critical for accuracy</Text>
            <TextInput
              style={styles.textInput}
              value={editHeight}
              onChangeText={setEditHeight}
              placeholder="e.g. 175"
              keyboardType="numeric"
            />
            <Text style={styles.fieldHint}>
              Your height is the primary calibration reference. Without it, measurement error is ±5cm instead of ±1-2cm.
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
  },
  infoCard: {
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
});
