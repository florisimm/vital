import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Heart, Home, MessageSquare, PersonStanding, Utensils } from 'lucide-react-native';
import { theme } from '@/lib/theme';

// Floating pill tab bar — visual match for the web app's BottomNav.
// Wired into Expo Router <Tabs> via the `tabBar` prop so navigation works.
const ICONS: Record<string, typeof Home> = {
  index: Home,
  coach: MessageSquare,
  training: PersonStanding,
  health: Heart,
  food: Utensils,
};

const LABELS: Record<string, string> = {
  index: 'Today',
  coach: 'Coach',
  training: 'Training',
  health: 'Health',
  food: 'Food',
};

export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <View style={styles.nav}>
        {state.routes.map((route, index) => {
          const Icon = ICONS[route.name] ?? Home;
          const label = LABELS[route.name] ?? route.name;
          const active = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!active && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
              <Icon
                size={21}
                strokeWidth={active ? 2.2 : 1.7}
                color={active ? '#fff' : theme.textNavInactive}
              />
              <Text style={[styles.label, { color: active ? '#fff' : theme.textNavInactive }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    gap: 2,
    borderRadius: 999,
    backgroundColor: theme.navBg,
    borderWidth: 1,
    borderColor: theme.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tab: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabActive: { backgroundColor: theme.navActivePill },
  label: { fontSize: 10, fontWeight: '600', lineHeight: 11 },
});
