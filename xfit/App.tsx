import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppInitialization } from './src/utils/useAppInitialization';

export default function App() {
  // Initialize app data (loads user profile & measurements from storage)
  useAppInitialization();

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
