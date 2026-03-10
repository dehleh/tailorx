import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useAuthStore } from '../stores/authStore';
import { generateId } from '../utils/helpers';

const CODE_LENGTH = 6;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tailorx-pose-api-production.up.railway.app';

export default function OTPVerificationScreen({ route, navigation }: any) {
  const { email } = route.params;
  const [code, setCode] = useState<string[]>(new Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const setUser = useAuthStore((s) => s.setUser);

  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

  const handleChange = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    if (text && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== CODE_LENGTH) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Verification failed');
        setIsLoading(false);
        return;
      }

      // Navigate FIRST, then update auth state to prevent navigator re-render
      // from resetting the navigation stack
      navigation.navigate('GettingStarted');
      
      await setUser({
        id: generateId(),
        email,
        displayName: '',
        isOnboarded: false,
        isPrivacyAccepted: false,
        createdAt: new Date().toISOString(),
      });
      setIsLoading(false);
    } catch (e: any) {
      setIsLoading(false);
      setError('Network error — is the server running?');
    }
  };

  const handleResend = async () => {
    try {
      await fetch(`${API_URL}/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      Alert.alert('Code Resent', 'A new verification code has been sent to your email.');
    } catch {
      Alert.alert('Error', 'Failed to resend code.');
    }
  };

  const isComplete = code.every((c) => c.length > 0);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Account Setup</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>✉️</Text>
          </View>

          <Text style={styles.title}>Enter verification code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to {maskedEmail}
          </Text>

          <View style={styles.codeRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[styles.codeInput, digit ? styles.codeInputFilled : null]}
                value={digit}
                onChangeText={(text) => handleChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            ))}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.verifyButton, !isComplete && styles.verifyButtonDisabled]}
            onPress={handleVerify}
            activeOpacity={0.8}
            disabled={!isComplete || isLoading}
          >
            <Text style={styles.verifyButtonText}>
              {isLoading ? 'Verifying...' : 'Verify & Continue'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleResend}>
            <Text style={styles.resendText}>
              Did not receive code? <Text style={styles.resendLink}>Resend code</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#E0F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
    marginBottom: 32,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  codeInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: '#E0F7F5',
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  verifyButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  resendText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  resendLink: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
