export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: Date;
  preferredUnit: 'cm' | 'inch';
  createdAt: Date;
}

export interface UserProfile extends User {
  measurementHistory: string[]; // Array of measurement IDs
  lastMeasurementDate?: Date;
}
