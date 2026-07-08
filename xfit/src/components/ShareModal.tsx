import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, Share, Alert, Linking,
} from 'react-native';
import { Colors } from '../constants/colors';
import { shareApi, ShareLinkResult } from '../services/shareApi';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  measurementId: string;
  measurements: Record<string, number>;
  unit: 'cm' | 'inch';
  createdByEmail?: string;
}

const APP_DOWNLOAD_LINK = 'https://tailor-xfit.app/download';

export default function ShareModal({ visible, onClose, measurementId, measurements, unit, createdByEmail }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [share, setShare] = useState<ShareLinkResult | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const createShareLink = async (): Promise<string | null> => {
    if (share?.shareUrl) return share.shareUrl;

    try {
      setIsCreatingShare(true);
      setShareError(null);
      const result = await shareApi.createShare({
        measurementId,
        measurements,
        unit,
        createdByEmail,
      });
      setShare(result);
      return result.shareUrl;
    } catch {
      setShareError('Could not create a secure share link. Please try again.');
      return null;
    } finally {
      setIsCreatingShare(false);
    }
  };

  useEffect(() => {
    if (visible) {
      createShareLink();
    }
  }, [visible, measurementId]);

  const handleCopyLink = async () => {
    const link = await createShareLink();
    if (!link) return;
    await Share.share({
      message: link,
      title: 'Tailor-XFit measurement link',
    });
  };

  const handleWhatsApp = async () => {
    const link = await createShareLink();
    if (!link) return;
    const message = `Check out my body measurements from Tailor-XFit!\n\n${formatMeasurements()}\n\nView read-only measurements: ${link}\n\nDon't have Tailor-XFit? Download it here: ${APP_DOWNLOAD_LINK}`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('WhatsApp not installed', 'Please install WhatsApp to share via this method.');
      }
    } catch {
      Alert.alert('Error', 'Could not open WhatsApp');
    }
  };

  const handleEmail = async () => {
    const link = await createShareLink();
    if (!link) return;
    const subject = 'My Body Measurements - Tailor-XFit';
    const body = `Here are my body measurements from Tailor-XFit:\n\n${formatMeasurements()}\n\nView read-only measurements: ${link}\n\nDon't have Tailor-XFit? Download it here: ${APP_DOWNLOAD_LINK}`;
    
    if (email) {
      const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await Linking.openURL(url);
    } else {
      const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await Linking.openURL(url);
    }
  };

  const handleNativeShare = async () => {
    const link = await createShareLink();
    if (!link) return;
    try {
      await Share.share({
        message: `My body measurements from Tailor-XFit:\n\n${formatMeasurements()}\n\nView read-only measurements: ${link}\n\nDon't have Tailor-XFit? Download it here: ${APP_DOWNLOAD_LINK}`,
        title: 'My Measurements',
      });
    } catch {
      // User cancelled
    }
  };

  const handleRevokeShare = async () => {
    if (!share) return;
    try {
      await shareApi.revokeShare(share.token, share.revokeToken);
      setShare(null);
      setShareError('Link revoked. Create a new link to share again.');
    } catch {
      Alert.alert('Could not revoke link', 'Please try again.');
    }
  };

  const formatMeasurements = () => {
    const suffix = unit === 'cm' ? 'cm' : 'in';
    return Object.entries(measurements)
      .filter(([, v]) => v > 0)
      .map(([key, val]) => {
        const display = unit === 'inch' ? (val / 2.54).toFixed(1) : val.toFixed(0);
        return `${key.charAt(0).toUpperCase() + key.slice(1)}: ${display} ${suffix}`;
      })
      .join('\n');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.shareIconCircle}>
              <Text style={styles.shareIcon}>🔗</Text>
            </View>
            <Text style={styles.title}>Share with your tailor</Text>
            <Text style={styles.subtitle}>
              Choose how you'd like to share your measurements securely
            </Text>
          </View>

          {/* Share Link */}
          <View style={styles.linkSection}>
            <Text style={styles.linkLabel}>Share Link</Text>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} numberOfLines={1}>
                {isCreatingShare ? 'Creating secure link...' : share?.shareUrl || shareError || 'Tap share to create a link'}
              </Text>
              <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
                <Text style={styles.copyIcon}>Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.linkExpiry}>
              {share?.expiresAt
                ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}`
                : 'Links are read-only and expire automatically.'}
            </Text>
          </View>

          {/* Quick Share */}
          <Text style={styles.quickShareLabel}>Quick Share</Text>
          <View style={styles.quickShareRow}>
            <TouchableOpacity style={[styles.shareMethodButton, styles.whatsappButton]} onPress={handleWhatsApp}>
              <Text style={styles.whatsappIcon}>💬</Text>
              <Text style={styles.whatsappText}>Whatsapp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareMethodButton, styles.emailButton]} onPress={handleEmail}>
              <Text style={styles.emailIcon}>📧</Text>
              <Text style={styles.emailText}>Email</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.nativeShareButton} onPress={handleNativeShare}>
            <Text style={styles.nativeShareText}>More share options</Text>
          </TouchableOpacity>
          {share && (
            <TouchableOpacity style={styles.revokeButton} onPress={handleRevokeShare}>
              <Text style={styles.revokeText}>Revoke link</Text>
            </TouchableOpacity>
          )}

          {/* Privacy notice */}
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <View style={styles.privacyTextContent}>
              <Text style={styles.privacyTitle}>Privacy:</Text>
              <Text style={styles.privacyDesc}>
                Recipients get read-only access to derived measurements only. The creating device receives a revoke token for this link.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeText: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  shareIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  shareIcon: {
    fontSize: 26,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  linkSection: {
    marginBottom: 20,
  },
  linkLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    marginRight: 10,
  },
  copyButton: {
    padding: 4,
  },
  copyIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  linkExpiry: {
    fontSize: 12,
    color: Colors.primary,
  },
  quickShareLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 10,
  },
  quickShareRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  shareMethodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  whatsappButton: {
    borderColor: '#25D366',
    backgroundColor: '#F0FFF4',
  },
  whatsappIcon: {
    fontSize: 16,
  },
  whatsappText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#25D366',
  },
  emailButton: {
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.inputBg,
  },
  emailIcon: {
    fontSize: 16,
  },
  emailText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  nativeShareButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  nativeShareText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  revokeButton: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 4,
  },
  revokeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.error,
  },
  privacyNotice: {
    flexDirection: 'row',
    backgroundColor: '#F0FFF4',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  privacyIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  privacyTextContent: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.success,
    marginBottom: 4,
  },
  privacyDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
});
