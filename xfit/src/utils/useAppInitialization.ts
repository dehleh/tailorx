import { useEffect } from 'react';
import { useMeasurementStore } from '../stores/measurementStore';
import { useUserStore } from '../stores/userStore';
import { useAuthStore } from '../stores/authStore';
import { useEnterpriseStore } from '../stores/enterpriseStore';

/**
 * Custom hook to initialize app data on startup.
 * Loads persisted auth, user profile and measurements from AsyncStorage.
 */
export const useAppInitialization = () => {
  const loadMeasurements = useMeasurementStore((state) => state.loadMeasurements);
  const loadUser = useUserStore((state) => state.loadUser);
  const loadAuth = useAuthStore((state) => state.loadAuth);
  const loadEnterpriseContext = useEnterpriseStore((state) => state.loadContext);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing Tailor-X app...');
        
        // Load auth state first
        await loadAuth();
        
        // Load user data from storage
        await loadUser();
        
        // Load measurements from storage
        await loadMeasurements();

        // Load enterprise workspace context
        await loadEnterpriseContext();
        
        console.log('App initialization complete');
      } catch (error) {
        console.error('App initialization error:', error);
      }
    };

    initializeApp();
  }, []);
};
