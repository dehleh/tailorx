export interface BodyMeasurement {
  id: string;
  userId: string;
  date: Date;
  measurements: {
    height: number;
    weight: number;
    chest: number;
    waist: number;
    hips: number;
    shoulders: number;
    neck: number;
    sleeve: number;
    inseam: number;
    thigh: number;
    calf: number;
  };
  unit: 'cm' | 'inch';
  images?: string[];
}

export interface MeasurementPoint {
  x: number;
  y: number;
  label: string;
  confidence: number;
}

export interface ScanResult {
  measurements: Partial<BodyMeasurement['measurements']>;
  keyPoints: MeasurementPoint[];
  accuracy: number;
}
