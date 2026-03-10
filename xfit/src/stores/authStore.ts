import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from '../types/auth';

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: AuthUser) => Promise<void>;
  updateUser: (data: Partial<AuthUser>) => Promise<void>;
  loadAuth: () => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  acceptPrivacy: () => Promise<void>;
  clearError: () => void;
}

const AUTH_KEY = '@tailorx:auth';

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isOnboarded: false,
  isLoading: false,
  error: null,

  setUser: async (user: AuthUser) => {
    try {
      set({ isLoading: true, error: null });
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user));
      set({
        user,
        isAuthenticated: true,
        isOnboarded: user.isOnboarded,
        isLoading: false,
      });
    } catch {
      set({ error: 'Failed to save auth data', isLoading: false });
    }
  },

  updateUser: async (data: Partial<AuthUser>) => {
    try {
      set({ isLoading: true, error: null });
      const current = get().user;
      if (!current) throw new Error('No user');
      const updated = { ...current, ...data };
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
      set({
        user: updated,
        isOnboarded: updated.isOnboarded,
        isLoading: false,
      });
    } catch {
      set({ error: 'Failed to update auth data', isLoading: false });
    }
  },

  loadAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const data = await AsyncStorage.getItem(AUTH_KEY);
      if (data) {
        const user: AuthUser = JSON.parse(data);
        set({
          user,
          isAuthenticated: true,
          isOnboarded: user.isOnboarded,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ error: 'Failed to load auth', isLoading: false });
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem(AUTH_KEY);
      set({ user: null, isAuthenticated: false, isOnboarded: false });
    } catch {
      set({ error: 'Failed to logout' });
    }
  },

  completeOnboarding: async () => {
    const current = get().user;
    if (current) {
      const updated = { ...current, isOnboarded: true };
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
      set({ user: updated, isOnboarded: true });
    }
  },

  acceptPrivacy: async () => {
    const current = get().user;
    if (current) {
      const updated = { ...current, isPrivacyAccepted: true };
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
      set({ user: updated });
    }
  },

  clearError: () => set({ error: null }),
}));
