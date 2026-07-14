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
    bust?: number;              // Female bust circumference (same scan level as chest)
    underbust?: number;         // Round under bust circumference
    cupDifference?: number;     // Bust minus underbust, used for cup estimation
    halfLength?: number;        // Shoulder to waist length
    topLength?: number;         // Shoulder to hip length (full top length)
    frontWidth?: number;        // Front garment width
    backWidth?: number;         // Back garment width
    armLength?: number;         // Full arm length
    outseam?: number;           // Side waist/hip to ankle/floor line
    rise?: number;              // Trouser rise
    knee?: number;              // Knee circumference
    ankle?: number;             // Ankle circumference
    wrist?: number;             // Wrist circumference
    // Arm circumferences (all genders, useful for shirt/blouse fitting)
    roundSleeveBicep?: number;  // Upper arm circumference at bicep
    roundSleeveElbow?: number;  // Circumference at elbow
  };
  unit: 'cm' | 'inch';
  source?: 'free' | 'enterprise';
  images?: string[];
  // Production accuracy metadata
  accuracy?: {
    overallScore: number;           // 0-100
    confidence: Record<string, number>;  // Per-measurement confidence
    anglesUsed: string[];           // e.g. ['front', 'side']
    calibrationMethod: string;      // 'known_height' | 'reference_object' | 'estimated'
    circumferenceSource?: string;
    missingRequiredAngles?: string[];
    calibrationConfidence?: number;
    contourConfidenceByPart?: Record<string, number>;
    anchorMeasurement?: { key: string; valueCm: number };
    measurementCatalogVersion?: string;
    measurementProfile?: 'male' | 'female' | 'other';
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
