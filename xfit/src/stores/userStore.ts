import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types/user';

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
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
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
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to update user data', isLoading: false });
    }
  },

  loadUser: async () => {
    try {
      set({ isLoading: true, error: null });
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      const user = data ? JSON.parse(data) : null;
      set({ user, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to load user data', isLoading: false });
    }
  },

  clearUser: async () => {
    try {
      set({ isLoading: true, error: null });
      await AsyncStorage.removeItem(STORAGE_KEY);
      set({ user: null, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to clear user data', isLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
