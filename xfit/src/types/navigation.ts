/**
 * Navigation type definitions for type-safe navigation
 */

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  EmailAuth: undefined;
  OTPVerification: { email: string };
  GettingStarted: undefined;
  PrivacyConsent: undefined;
  MainTabs: undefined;
  EnterpriseSetup: undefined;
  EnterpriseInvite: { inviteCode?: string } | undefined;
};

export type RootTabParamList = {
  Home: undefined;
  Scan: undefined;
  Measurements: undefined;
  Profile: undefined;
};

export type ScanStackParamList = {
  ScanHome: {
    calibration?: any;
    knownHeight?: number;
    anchorMeasurement?: { key: string; valueCm: number };
    initialStep?: 'front' | 'side' | 'back';
  } | undefined;
  Calibration: {
    onComplete?: (calibration: any) => void;
  } | undefined;
  PreparationChecklist: undefined;
  MultiCapture: {
    calibration?: any;
    knownHeight?: number;
    anchorMeasurement?: { key: string; valueCm: number };
    initialStep?: 'front' | 'side' | 'back';
  };
  Processing: {
    result: any;
    accuracyReport: any;
    measurementId?: string;
  };
  ScanResults: {
    result: any;
    accuracyReport: any;
    measurementId?: string;
  };
};
