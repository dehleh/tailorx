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
import { Theme } from '../constants/theme';
import { useUserStore } from '../stores/userStore';
import { useMeasurementStore } from '../stores/measurementStore';
import { UserProfile } from '../types/user';

export default function ProfileScreen() {
  const user = useUserStore((state) => state.user);
  const loadUser = useUserStore((state) => state.loadUser);
  const setUser = useUserStore((state) => state.setUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const measurements = useMeasurementStore((state) => state.measurements);

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

  const displayName = user?.name || 'Set Up Profile';
  const initials = (user?.name || 'U')
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
    backgroundColor: Theme.colors.background,
  },
  profileHeader: {
    backgroundColor: Theme.colors.white,
    paddingTop: Theme.spacing.xxl,
    paddingBottom: Theme.spacing.lg,
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
    ...Theme.shadows.medium,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.white,
  },
  userName: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xs,
  },
  userEmail: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
    marginBottom: Theme.spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: Theme.spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.secondary,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Theme.colors.border,
    marginHorizontal: Theme.spacing.sm,
  },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  completeBannerIcon: {
    fontSize: 24,
    marginRight: Theme.spacing.sm,
  },
  completeBannerTitle: {
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
  },
  completeBannerText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.secondary,
    marginTop: 2,
  },
  editProfileButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    alignItems: 'center',
    ...Theme.shadows.medium,
  },
  editProfileText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  infoSection: {
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
  },
  infoCard: {
    backgroundColor: Theme.colors.white,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  infoLabel: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
  },
  infoValue: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
  },
  resetButton: {
    backgroundColor: Theme.colors.white,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.error,
  },
  resetText: {
    color: Theme.colors.error,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  menuArrow: {
    fontSize: 28,
    color: Theme.colors.text.light,
    marginLeft: Theme.spacing.sm,
  },
  versionText: {
    textAlign: 'center',
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.light,
    paddingVertical: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Theme.spacing.lg,
    backgroundColor: Theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  modalCancel: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.secondary,
  },
  modalTitle: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.text.primary,
  },
  modalSave: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.primary,
  },
  modalBody: {
    padding: Theme.spacing.lg,
  },
  fieldLabel: {
    fontSize: Theme.fontSize.sm,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xs,
    marginTop: Theme.spacing.md,
  },
  fieldHint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.light,
    marginTop: 4,
    lineHeight: 16,
  },
  textInput: {
    backgroundColor: Theme.colors.white,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text.primary,
  },
  genderRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  genderOption: {
    flex: 1,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    alignItems: 'center',
    backgroundColor: Theme.colors.white,
  },
  genderOptionActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: '#F0ECFF',
  },
  genderOptionText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
    fontWeight: Theme.fontWeight.medium,
  },
  genderOptionTextActive: {
    color: Theme.colors.primary,
    fontWeight: Theme.fontWeight.bold,
  },
});
