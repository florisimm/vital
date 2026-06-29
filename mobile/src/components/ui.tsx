import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

// Grouped settings list — visual match for the web app's ProfileSection
// (glass card with hairline separators between rows).
export function ProfileSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.sectionWrap}>
      {title ? <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text> : null}
      <View style={styles.section}>{children}</View>
    </View>
  );
}

export function ProfileRow({
  children,
  separator,
  onPress,
}: {
  children: ReactNode;
  separator?: boolean;
  onPress?: () => void;
}) {
  const inner = <View style={styles.rowInner}>{children}</View>;
  return (
    <View style={[styles.row, separator && styles.rowSeparator]}>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
          {inner}
        </Pressable>
      ) : (
        inner
      )}
    </View>
  );
}

// iOS-style toggle implemented without extra deps so it matches the dark theme.
export function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[styles.toggle, { backgroundColor: value ? theme.teal : 'rgba(255,255,255,0.18)' }]}
    >
      <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  sectionWrap: { gap: 8 },
  sectionTitle: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  section: {
    backgroundColor: theme.glassBg,
    borderWidth: 1,
    borderColor: theme.glassBorder,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.09)' },
  rowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pressed: { opacity: 0.6 },
  toggle: { width: 50, height: 30, borderRadius: 999, padding: 3, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 999, backgroundColor: '#fff' },
});
