import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';

// Large-title scaffold mirroring the web app's PremiumScreen. Screen content
// has NOT been ported yet — each tab shows its title + a placeholder note.
export function TabScreen({ title, children }: { title: string; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 56,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 100,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{title}</Text>
      {children ?? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Screen not migrated yet.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', marginBottom: 16 },
  placeholder: {
    marginTop: 8,
    padding: 20,
    borderRadius: 16,
    backgroundColor: theme.glassBg,
    borderWidth: 1,
    borderColor: theme.glassBorder,
  },
  placeholderText: { color: theme.textDim, fontSize: 15 },
});
