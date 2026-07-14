import React from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useUserStore } from '../stores/userStore';
import { useMeasurementStore } from '../stores/measurementStore';
import { buildStyleAdvice } from '../services/styleAdvisor';

const tutorialVideos = [
  {
    title: 'Prepare for an accurate scan',
    body: 'Fitted clothing, lighting, camera distance, front view, and side view.',
    url: 'https://www.youtube.com/results?search_query=how+to+prepare+for+body+measurement+scan',
  },
  {
    title: 'How tailors take body measurements',
    body: 'Understand the body points a tailor checks when confirming a digital measurement.',
    url: 'https://www.youtube.com/results?search_query=tailor+body+measurement+tutorial',
  },
  {
    title: 'How to choose clothing colors',
    body: 'Learn simple color combination rules for daily outfits and special occasions.',
    url: 'https://www.youtube.com/results?search_query=clothing+color+combination+guide',
  },
];

const guideSections = [
  {
    label: 'Body type',
    title: 'Understand your proportions',
    body: 'Learn how shoulder, waist, hip, and height balance affect garment shape and fit.',
  },
  {
    label: 'Style fit',
    title: 'Choose styles that flatter',
    body: 'Match silhouettes, lengths, necklines, and trouser rises to your body profile.',
  },
  {
    label: 'Color',
    title: 'Blend colors with intention',
    body: 'Use contrast, undertones, neutral anchors, and accent colors to build clean outfits.',
  },
  {
    label: 'Wardrobe',
    title: 'Build better wardrobe culture',
    body: 'Keep core basics, maintain garments well, rotate pieces, and tailor key outfits.',
  },
  {
    label: 'Shopping',
    title: 'Shop with measurements',
    body: 'Buy by fit, fabric, alteration potential, and repeat wear value instead of impulse.',
  },
];

export default function EducationHubScreen() {
  const user = useUserStore((s) => s.user);
  const latestMeasurement = useMeasurementStore((s) => s.measurements.slice(-1)[0] || null);
  const advice = buildStyleAdvice(user, latestMeasurement);

  const openTutorialVideo = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open video', `Open this link in your browser: ${url}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Tailor-X learning</Text>
        <Text style={styles.title}>Guides and tutorials</Text>
        <Text style={styles.subtitle}>
          Learn how to scan well, understand your body profile, and make better style decisions.
        </Text>
      </View>

      <View style={styles.adviceCard}>
        <Text style={styles.cardLabel}>Personal style engine</Text>
        <Text style={styles.adviceTitle}>{advice.bodyType}</Text>
        <Text style={styles.adviceBody}>{advice.bodyTypeReason}</Text>
        <View style={styles.paletteRow}>
          {advice.colorPalette.map((color) => (
            <Text key={color} style={styles.paletteChip}>{color}</Text>
          ))}
        </View>
      </View>

      {tutorialVideos.map((video) => (
        <View key={video.title} style={styles.videoCard}>
          <Text style={styles.cardLabel}>Video tutorial</Text>
          <Text style={styles.cardTitle}>{video.title}</Text>
          <Text style={styles.cardBody}>{video.body}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => openTutorialVideo(video.url)}>
            <Text style={styles.primaryButtonText}>Watch video</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.checklistCard}>
        <Text style={styles.cardLabel}>Quick scan checklist</Text>
        <View style={styles.checkRow}>
          <Text style={styles.checkDot}>1</Text>
          <Text style={styles.checkText}>Wear fitted clothing and stand in even lighting.</Text>
        </View>
        <View style={styles.checkRow}>
          <Text style={styles.checkDot}>2</Text>
          <Text style={styles.checkText}>Keep your full body inside the frame with feet visible.</Text>
        </View>
        <View style={styles.checkRow}>
          <Text style={styles.checkDot}>3</Text>
          <Text style={styles.checkText}>Capture both front and side views for circumference accuracy.</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Style and body guidance</Text>
      <View style={styles.guideCard}>
        <Text style={styles.guideLabel}>Fit recommendations</Text>
        {advice.fitTips.map((tip) => (
          <Text key={tip} style={styles.guideBody}>- {tip}</Text>
        ))}
      </View>
      <View style={styles.guideCard}>
        <Text style={styles.guideLabel}>Style ideas</Text>
        {advice.styleIdeas.map((tip) => (
          <Text key={tip} style={styles.guideBody}>- {tip}</Text>
        ))}
      </View>
      <View style={styles.guideCard}>
        <Text style={styles.guideLabel}>Wardrobe culture</Text>
        {advice.wardrobeHabits.map((tip) => (
          <Text key={tip} style={styles.guideBody}>- {tip}</Text>
        ))}
      </View>
      <View style={styles.guideCard}>
        <Text style={styles.guideLabel}>Shopping culture</Text>
        {advice.shoppingRules.map((tip) => (
          <Text key={tip} style={styles.guideBody}>- {tip}</Text>
        ))}
      </View>
      {guideSections.map((section) => (
        <View key={section.label} style={styles.guideCard}>
          <Text style={styles.guideLabel}>{section.label}</Text>
          <Text style={styles.guideTitle}>{section.title}</Text>
          <Text style={styles.guideBody}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    marginBottom: 18,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  videoCard: {
    backgroundColor: Colors.secondary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  adviceCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    marginBottom: 16,
  },
  adviceTitle: {
    color: Colors.text.primary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  adviceBody: {
    color: Colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteChip: {
    backgroundColor: '#E0F7F5',
    borderRadius: 999,
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'capitalize',
  },
  checklistCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    marginBottom: 22,
  },
  cardLabel: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardTitle: {
    color: Colors.white,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 25,
  },
  cardBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  checkDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0F7F5',
    color: Colors.primary,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '700',
  },
  checkText: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  guideCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  guideLabel: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  guideTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  guideBody: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
