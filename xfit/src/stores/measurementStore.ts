import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BodyMeasurement } from '../types/measurements';

interface MeasurementStore {
  measurements: BodyMeasurement[];
  currentMeasurement: BodyMeasurement | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  addMeasurement: (measurement: BodyMeasurement) => Promise<void>;
  updateMeasurement: (id: string, measurement: Partial<BodyMeasurement>) => Promise<void>;
  deleteMeasurement: (id: string) => Promise<void>;
  loadMeasurements: () => Promise<void>;
  setCurrentMeasurement: (measurement: BodyMeasurement | null) => void;
  clearError: () => void;
}

const STORAGE_KEY = '@tailorx:measurements';

export const useMeasurementStore = create<MeasurementStore>((set, get) => ({
  measurements: [],
  currentMeasurement: null,
  isLoading: false,
  error: null,

  addMeasurement: async (measurement: BodyMeasurement) => {
    try {
      set({ isLoading: true, error: null });
      const measurements = [...get().measurements, measurement];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
      set({ measurements, currentMeasurement: measurement, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to save measurement', isLoading: false });
    }
  },

  updateMeasurement: async (id: string, updatedData: Partial<BodyMeasurement>) => {
    try {
      set({ isLoading: true, error: null });
      const measurements = get().measurements.map((m) =>
        m.id === id ? { ...m, ...updatedData } : m
      );
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
      set({ measurements, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to update measurement', isLoading: false });
    }
  },

  deleteMeasurement: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const measurements = get().measurements.filter((m) => m.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
      set({ measurements, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to delete measurement', isLoading: false });
    }
  },

  loadMeasurements: async () => {
    try {
      set({ isLoading: true, error: null });
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      const measurements = data ? JSON.parse(data) : [];
      set({ measurements, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to load measurements', isLoading: false });
    }
  },

  setCurrentMeasurement: (measurement: BodyMeasurement | null) => {
    set({ currentMeasurement: measurement });
  },

  clearError: () => {
    set({ error: null });
  },
}));
