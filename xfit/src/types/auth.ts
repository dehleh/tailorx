export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isOnboarded: boolean;
  isPrivacyAccepted: boolean;
  createdAt: string;
}

export interface OTPRequest {
  email: string;
}

export interface OTPVerification {
  email: string;
  code: string;
}

export interface ShareLink {
  id: string;
  measurementId: string;
  shareUrl: string;
  expiresAt: string;
  createdAt: string;
}

export type OnboardingStep = 'splash' | 'welcome' | 'email' | 'otp' | 'getting-started' | 'privacy';

export type AuthStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  EmailAuth: undefined;
  OTPVerification: { email: string };
  GettingStarted: undefined;
  PrivacyConsent: undefined;
};
