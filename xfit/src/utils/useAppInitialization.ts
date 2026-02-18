import { useEffect } from 'react';
import { useMeasurementStore } from '../stores/measurementStore';
import { useUserStore } from '../stores/userStore';

/**
 * Custom hook to initialize app data on startup.
 * Loads persisted user profile and measurements from AsyncStorage.
 */
export const useAppInitialization = () => {
  const loadMeasurements = useMeasurementStore((state) => state.loadMeasurements);
  const loadUser = useUserStore((state) => state.loadUser);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing Tailor-X app...');
        
        // Load user data from storage
        await loadUser();
        
        // Load measurements from storage
        await loadMeasurements();
        
        console.log('App initialization complete');
      } catch (error) {
        console.error('App initialization error:', error);
      }
    };

    initializeApp();
  }, []);
};
