export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: Date;
  heightCm?: number;       // User's known height in cm (critical for calibration)
  weightKg?: number;       // User's weight in kg
  preferredUnit: 'cm' | 'inch';
  country?: string;
  preferredStyle?: 'classic' | 'modern' | 'streetwear' | 'modest' | 'traditional' | 'business' | 'minimal';
  colorPreference?: 'neutral' | 'warm' | 'cool' | 'bold' | 'earth';
  createdAt: Date;
}

export interface UserProfile extends User {
  measurementHistory: string[]; // Array of measurement IDs
  lastMeasurementDate?: Date;
  profileSyncedAt?: string;
}
