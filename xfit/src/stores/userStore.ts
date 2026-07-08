import { create } from 'zustand';
import { UserProfile } from '../types/user';
import { storageService } from '../services/storageService';

interface UserStore {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: UserProfile) => Promise<void>;
  updateUser: (userData: Partial<UserProfile>) => Promise<void>;
  loadUser: () => Promise<void>;
  clearUser: () => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEY = '@tailorx:user';

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  setUser: async (user: UserProfile) => {
    try {
      set({ isLoading: true, error: null });
      await storageService.saveSensitive(STORAGE_KEY, user);
      set({ user, isLoading: false });
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
      await storageService.saveSensitive(STORAGE_KEY, updatedUser);
      set({ user: updatedUser, isLoading: false });
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
