import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav } from '@/components/BottomNav';
import { ProfileButton } from '@/components/ProfileButton';

// Tab navigator. The floating pill BottomNav is supplied as a custom tabBar so
// the 5 tabs actually navigate. ProfileButton is overlaid top-RIGHT on every
// tab (web parity).
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <BottomNav {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
        <Tabs.Screen name="training" options={{ title: 'Training' }} />
        <Tabs.Screen name="health" options={{ title: 'Health' }} />
        <Tabs.Screen name="food" options={{ title: 'Food' }} />
      </Tabs>

      <View style={{ position: 'absolute', top: insets.top + 8, right: 20 }} pointerEvents="box-none">
        <ProfileButton />
      </View>
    </View>
  );
}
