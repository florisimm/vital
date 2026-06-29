import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Root layout. Mirrors the web app's app/layout.tsx role: global providers
// live here. Tab navigation (Today / Coach / Training / Health / Food) will be
// added under app/(tabs)/ when screens are ported — see MIGRATION.md.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#050608' },
        }}
      />
    </SafeAreaProvider>
  );
}
