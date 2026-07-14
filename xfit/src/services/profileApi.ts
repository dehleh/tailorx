import { apiClient } from './apiClient';
import { UserProfile } from '../types/user';

export interface RemoteUserProfile {
  id?: string;
  email: string;
  displayName: string;
  gender?: 'male' | 'female' | 'other';
  heightCm?: number;
  weightKg?: number;
  preferredUnit?: 'cm' | 'inch';
  country?: string;
  preferredStyle?: string;
  colorPreference?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function toRemoteProfile(profile: UserProfile): RemoteUserProfile {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.name,
    gender: profile.gender,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    preferredUnit: profile.preferredUnit,
    country: profile.country,
    preferredStyle: profile.preferredStyle,
    colorPreference: profile.colorPreference,
  };
}

class ProfileApi {
  async getProfile(email: string): Promise<RemoteUserProfile | null> {
    if (!email) return null;
    try {
      return await apiClient.get<RemoteUserProfile>(
        `/v1/users/profile?email=${encodeURIComponent(email)}`
      );
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  }

  async upsertProfile(profile: RemoteUserProfile): Promise<RemoteUserProfile> {
    return apiClient.put<RemoteUserProfile>('/v1/users/profile', profile);
  }
}

export const profileApi = new ProfileApi();
