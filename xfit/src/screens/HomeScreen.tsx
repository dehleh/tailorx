import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/colors';
import { useMeasurementStore } from '../stores/measurementStore';
import { useAuthStore } from '../stores/authStore';
import { useEnterpriseStore } from '../stores/enterpriseStore';
import { formatMeasurement, timeAgo } from '../utils/helpers';

export default function HomeScreen({ navigation }: any) {
  const measurements = useMeasurementStore((s) => s.measurements);
  const authUser = useAuthStore((s) => s.user);
  const activeInviteCode = useEnterpriseStore((s) => s.activeInviteCode);
  const activeOrganizationName = useEnterpriseStore((s) => s.organizationName);
  const displayName = authUser?.displayName || 'User';
  const latestMeasurements = measurements.slice(-3).reverse();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{displayName}</Text>
          <Text style={styles.subGreeting}>Ready to get your perfect fit?</Text>
        </View>
        <TouchableOpacity
          style={styles.avatarCircle}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.avatarText}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Start New Scan Card */}
      <TouchableOpacity
        style={styles.scanCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Scan')}
      >
        <View style={styles.scanCardInner}>
          <View style={styles.scanCardDot} />
          <Text style={styles.scanCardTitle}>Start New Scan</Text>
          <Text style={styles.scanCardDesc}>
            Quickly capture your measurements in under 5 minutes
          </Text>
          <View style={styles.scanCardButton}>
            <Text style={styles.scanCardButtonText}>Begin Scanning</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.enterpriseCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('EnterpriseInvite')}
      >
        <Text style={styles.enterpriseEyebrow}>Enterprise</Text>
        <Text style={styles.enterpriseTitle}>Scan for a fashion house or tailor</Text>
        <Text style={styles.enterpriseDesc}>
          {activeInviteCode
            ? `Active branded code: ${activeInviteCode}${activeOrganizationName ? ` for ${activeOrganizationName}` : ''}`
            : 'Load a branded invite code to start a licensed customer scan.'}
        </Text>
      </TouchableOpacity>

      {/* Recent Measurements */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent measurements</Text>
          {measurements.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Measurements')}>
              <Text style={styles.viewAllText}>View all</Text>
            </TouchableOpacity>
          )}
        </View>

        {latestMeasurements.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.measurementScroll}>
            {latestMeasurements.map((m) => (
              <View key={m.id} style={styles.measurementChip}>
                <Text style={styles.chipAccuracy}>
                  {m.accuracy?.overallScore ? `${Math.round(m.accuracy.overallScore)}% accurate` : 'Scan'}
                </Text>
                <Text style={styles.chipDate}>{timeAgo(m.date)}</Text>
                <View style={styles.chipRow}>
                  {(['chest', 'waist', 'hips', 'shoulders'] as const).map((key) => {
                    const val = m.measurements[key];
                    if (!val) return null;
                    return (
                      <View key={key} style={styles.chipMeasure}>
                        <Text style={styles.chipLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                        <Text style={styles.chipValue}>{formatMeasurement(val, m.unit)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📏</Text>
            <Text style={styles.emptyText}>No measurements yet</Text>
            <Text style={styles.emptySubtext}>Start your first scan to see results here</Text>
          </View>
        )}
      </View>

      {/* Help & Tutorials */}
      <View style={styles.helpCard}>
        <View style={styles.helpContent}>
          <Text style={styles.helpIcon}>📚</Text>
          <Text style={styles.helpText}>Help and Tutorials</Text>
        </View>
        <TouchableOpacity style={styles.tutorialButton}>
          <Text style={styles.tutorialButtonText}>View tutorials</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy note */}
      <View style={styles.privacyRow}>
        <Text style={styles.privacyDot}>🟢</Text>
        <Text style={styles.privacyText}>Your data is private and secure</Text>
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  avatarText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  // Scan CTA card
  scanCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    overflow: 'hidden',
  },
  scanCardInner: {
    padding: 20,
  },
  scanCardDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginBottom: 12,
  },
  scanCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 6,
  },
  scanCardDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 16,
    lineHeight: 18,
  },
  scanCardButton: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  scanCardButtonText: {
    color: Colors.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  enterpriseCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: Colors.white,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  enterpriseEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  enterpriseTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  enterpriseDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 19,
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  measurementScroll: {
    paddingLeft: 20,
  },
  measurementChip: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginRight: 12,
    width: 260,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipAccuracy: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
    marginBottom: 4,
  },
  chipDate: {
    fontSize: 12,
    color: Colors.text.light,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chipMeasure: {
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 11,
    color: Colors.text.light,
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  // Help card
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  helpContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  helpIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  helpText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  tutorialButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  tutorialButtonText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  // Privacy
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  privacyDot: {
    fontSize: 10,
    marginRight: 8,
  },
  privacyText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
});
