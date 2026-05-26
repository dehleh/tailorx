import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppInitialization } from './src/utils/useAppInitialization';

// Sentry init (no-op if EXPO_PUBLIC_SENTRY_DSN is unset)
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

function App() {
  // Initialize app data (loads user profile & measurements from storage)
  useAppInitialization();

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}

export default SENTRY_DSN ? Sentry.wrap(App) : App;
