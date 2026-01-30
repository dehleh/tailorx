import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Theme } from '../constants/theme';
import { useUserStore } from '../stores/userStore';
import { useMeasurementStore } from '../stores/measurementStore';
import { storageService } from '../services/storageService';

export default function ProfileScreen() {
  const user = useUserStore((state) => state.user);
  const loadUser = useUserStore((state) => state.loadUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const setUser = useUserStore((state) => state.setUser);
  const measurements = useMeasurementStore((state) => state.measurements);
  
  useEffect(() => {
    loadUser();
    
    // Create demo user if none exists
    if (!user) {
      setUser({
        id: 'user_' + Date.now(),
        name: 'John Doe',
        email: 'john.doe@example.com',
        gender: 'male',
        preferredUnit: 'cm',
        createdAt: new Date(),
        measurementHistory: [],
      });
    }
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await clearUser();
            await storageService.removeAuthToken();
            Alert.alert('Success', 'Logged out successfully');
          },
        },
      ]
    );
  };

  // Mock user data with actual store data
  const userData = {
    name: user?.name || 'Guest User',
    email: user?.email || 'guest@example.com',
    gender: user?.gender || 'other',
    joinDate: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'January 2026',
    totalScans: measurements.length,
  };

  const menuItems = [
    {
      id: '1',
      icon: '⚙️',
      title: 'Settings',
      subtitle: 'App preferences and notifications',
    },
    {
      id: '2',
      icon: '🔒',
      title: 'Privacy',
      subtitle: 'Manage your data and privacy',
    },
    {
      id: '3',
      icon: '💡',
      title: 'Tips & Guides',
      subtitle: 'Learn how to get the best measurements',
    },
    {
      id: '4',
      icon: '📞',
      title: 'Support',
      subtitle: 'Get help and contact us',
    },
    {
      id: '5',
      icon: 'ℹ️',
      title: 'About',
      subtitle: 'App version and information',
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userData.name.split(' ').map((n) => n[0]).join('')}
            </Text>
          </View>
        </View>
        <Text style={styles.userName}>{userData.name}</Text>
        <Text style={styles.userEmail}>{userData.email}</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userData.totalScans}</Text>
            <Text style={styles.statLabel}>Total Scans</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userData.joinDate}</Text>
            <Text style={styles.statLabel}>Member Since</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.editProfileButton}>
        <Text style={styles.editProfileText}>✏️ Edit Profile</Text>
      </TouchableOpacity>

      <View style={styles.menuContainer}>
        {menuItems.map((item) => (
          <TouchableOpacity key={item.id} style={styles.menuItem}>
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 Logout</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>Version 1.0.0</Text>
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
  avatarContainer: {
    marginBottom: Theme.spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: Theme.spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Theme.fontSize.xl,
    fontWeight: Theme.fontWeight.bold,
    color: Theme.colors.primary,
    marginBottom: Theme.spacing.xs,
  },
  statLabel: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Theme.colors.border,
    marginHorizontal: Theme.spacing.lg,
  },
  editProfileButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    alignItems: 'center',
    ...Theme.shadows.medium,
  },
  editProfileText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  menuContainer: {
    backgroundColor: Theme.colors.white,
    marginBottom: Theme.spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: Theme.spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.xs,
  },
  menuSubtitle: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.text.secondary,
  },
  menuArrow: {
    fontSize: 32,
    color: Theme.colors.text.light,
  },
  logoutButton: {
    backgroundColor: Theme.colors.white,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.error,
  },
  logoutText: {
    color: Theme.colors.error,
    fontSize: Theme.fontSize.md,
    fontWeight: Theme.fontWeight.semibold,
  },
  versionText: {
    textAlign: 'center',
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.text.light,
    paddingVertical: Theme.spacing.lg,
  },
});
