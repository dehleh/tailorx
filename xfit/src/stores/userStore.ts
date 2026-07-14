import { create } from 'zustand';
import { UserProfile } from '../types/user';
import { storageService } from '../services/storageService';
import { profileApi, toRemoteProfile, RemoteUserProfile } from '../services/profileApi';

interface UserStore {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: UserProfile) => Promise<void>;
  updateUser: (userData: Partial<UserProfile>) => Promise<void>;
  loadUser: () => Promise<void>;
  syncRemoteProfile: (email: string) => Promise<void>;
  clearUser: () => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEY = '@tailorx:user';

const mergeRemoteProfile = (
  current: UserProfile | null,
  remote: RemoteUserProfile,
): UserProfile => ({
  id: current?.id || remote.id || `user_${Date.now()}`,
  name: remote.displayName || current?.name || '',
  email: remote.email || current?.email || '',
  gender: remote.gender || current?.gender || 'other',
  heightCm: remote.heightCm ?? current?.heightCm,
  weightKg: remote.weightKg ?? current?.weightKg,
  preferredUnit: remote.preferredUnit || current?.preferredUnit || 'cm',
  country: remote.country || current?.country,
  preferredStyle: (remote.preferredStyle as UserProfile['preferredStyle']) || current?.preferredStyle,
  colorPreference: (remote.colorPreference as UserProfile['colorPreference']) || current?.colorPreference,
  createdAt: current?.createdAt || (remote.createdAt ? new Date(remote.createdAt) : new Date()),
  measurementHistory: current?.measurementHistory || [],
  lastMeasurementDate: current?.lastMeasurementDate,
  profileSyncedAt: remote.updatedAt || new Date().toISOString(),
});

async function persistLocalAndRemote(profile: UserProfile): Promise<UserProfile> {
  await storageService.saveSensitive(STORAGE_KEY, profile);
  try {
    const remote = await profileApi.upsertProfile(toRemoteProfile(profile));
    const synced = mergeRemoteProfile(profile, remote);
    await storageService.saveSensitive(STORAGE_KEY, synced);
    return synced;
  } catch (error) {
    return profile;
  }
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  setUser: async (user: UserProfile) => {
    try {
      set({ isLoading: true, error: null });
      const savedUser = await persistLocalAndRemote(user);
      set({ user: savedUser, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to save user data', isLoading: false });
    }
  },

  updateUser: async (userData: Partial<UserProfile>) => {
    try {
      set({ isLoading: true, error: null });
      const currentUser = get().user;
      if (!currentUser) {
        throw new Error('No user to update');
      }
      const updatedUser = { ...currentUser, ...userData };
      const savedUser = await persistLocalAndRemote(updatedUser);
      set({ user: savedUser, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to update user data', isLoading: false });
    }
  },

  loadUser: async () => {
    try {
      set({ isLoading: true, error: null });
      const user = await storageService.loadSensitive<UserProfile>(STORAGE_KEY);
      set({ user, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to load user data', isLoading: false });
    }
  },

  syncRemoteProfile: async (email: string) => {
    if (!email) return;
    try {
      const currentUser = get().user;
      const remote = await profileApi.getProfile(email);
      if (!remote) {
        if (currentUser?.email) {
          const savedUser = await persistLocalAndRemote(currentUser);
          set({ user: savedUser });
        }
        return;
      }

      const merged = mergeRemoteProfile(currentUser, remote);
      await storageService.saveSensitive(STORAGE_KEY, merged);
      set({ user: merged });
    } catch {
      // Profile sync is best-effort; local secure storage remains the source of truth offline.
    }
  },

  clearUser: async () => {
    try {
      set({ isLoading: true, error: null });
      await storageService.removeSensitive(STORAGE_KEY);
      set({ user: null, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to clear user data', isLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
