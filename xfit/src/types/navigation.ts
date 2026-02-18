/**
 * Navigation type definitions for type-safe navigation
 */

export type RootTabParamList = {
  Home: undefined;
  Scan: undefined;
  Measurements: undefined;
  Profile: undefined;
};

export type ScanStackParamList = {
  ScanHome: undefined;
  Calibration: {
    onComplete: (calibration: any) => void;
  };
  MultiCapture: {
    calibration?: any;
    knownHeight?: number;
  };
  ScanResults: {
    result: any;
    accuracyReport: any;
  };
};
