import { create } from 'zustand';
import { AuthUser } from '../types/auth';
import { storageService } from '../services/storageService';

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
      await storageService.saveSensitive(AUTH_KEY, user);
      set({
        user,
        isAuthenticated: true,
        isOnboarded: user.isOnboarded,
        error: null,
      });
    } catch {
      set({ error: 'Failed to save auth data' });
    }
  },

  updateUser: async (data: Partial<AuthUser>) => {
    try {
      const current = get().user;
      if (!current) throw new Error('No user');
      const updated = { ...current, ...data };
      await storageService.saveSensitive(AUTH_KEY, updated);
      set({
        user: updated,
        isOnboarded: updated.isOnboarded,
        error: null,
      });
    } catch {
      set({ error: 'Failed to update auth data' });
    }
  },

  loadAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const user = await storageService.loadSensitive<AuthUser>(AUTH_KEY);
      if (user) {
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
      await storageService.removeSensitive(AUTH_KEY);
      set({ user: null, isAuthenticated: false, isOnboarded: false });
    } catch {
      set({ error: 'Failed to logout' });
    }
  },

  completeOnboarding: async () => {
    const current = get().user;
    if (current) {
      const updated = { ...current, isOnboarded: true };
      await storageService.saveSensitive(AUTH_KEY, updated);
      set({ user: updated, isOnboarded: true });
    }
  },

  acceptPrivacy: async () => {
    const current = get().user;
    if (current) {
      const updated = { ...current, isPrivacyAccepted: true };
      await storageService.saveSensitive(AUTH_KEY, updated);
      set({ user: updated });
    }
  },

  clearError: () => set({ error: null }),
}));
