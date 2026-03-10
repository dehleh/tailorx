export interface AuthUser {
  id: string;
  phoneNumber: string;
  displayName: string;
  avatarUrl?: string;
  isOnboarded: boolean;
  isPrivacyAccepted: boolean;
  createdAt: string;
}

export interface OTPRequest {
  phoneNumber: string;
  countryCode: string;
}

export interface OTPVerification {
  phoneNumber: string;
  code: string;
}

export interface ShareLink {
  id: string;
  measurementId: string;
  shareUrl: string;
  expiresAt: string;
  createdAt: string;
}

export type OnboardingStep = 'splash' | 'welcome' | 'phone' | 'otp' | 'getting-started' | 'privacy';

export type AuthStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  PhoneAuth: undefined;
  OTPVerification: { phoneNumber: string; countryCode: string };
  GettingStarted: undefined;
  PrivacyConsent: undefined;
};
