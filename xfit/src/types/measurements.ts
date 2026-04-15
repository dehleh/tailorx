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
    // Female-specific garment measurements
    underbust?: number;         // Round under bust circumference
    halfLength?: number;        // Shoulder to waist length
    topLength?: number;         // Shoulder to hip length (full top length)
    // Arm circumferences (all genders, useful for shirt/blouse fitting)
    roundSleeveBicep?: number;  // Upper arm circumference at bicep
    roundSleeveElbow?: number;  // Circumference at elbow
  };
  unit: 'cm' | 'inch';
  images?: string[];
  // Production accuracy metadata
  accuracy?: {
    overallScore: number;           // 0-100
    confidence: Record<string, number>;  // Per-measurement confidence
    anglesUsed: string[];           // e.g. ['front', 'side']
    calibrationMethod: string;      // 'known_height' | 'reference_object' | 'estimated'
    engineVersion: string;
    processingTimeMs: number;
    warnings: string[];
  };
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
