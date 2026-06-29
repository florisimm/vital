import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Placeholder landing screen. The actual Today/Coach/Training/Health/Food
// screens have NOT been ported yet — this scaffold only proves the project
// boots. See MIGRATION.md for the porting plan.
export default function Index() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Kern</Text>
      <Text style={styles.subtitle}>React Native scaffold</Text>
      <Text style={styles.note}>
        Setup only — screens not migrated yet. See MIGRATION.md.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050608',
    padding: 24,
    gap: 8,
  },
  title: {
    color: '#2dd4bf',
    fontSize: 34,
    fontWeight: '700',
  },
  subtitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  note: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});
