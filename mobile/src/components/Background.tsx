import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { theme } from '@/lib/theme';

// Fixed full-screen background. The web app uses two CSS radial-gradients
// (teal glow top-right, orange glow bottom-left) over rgb(5,6,8). React Native
// has no radial-gradient, so we approximate each glow with a diagonal
// LinearGradient fading to transparent from its corner.
export function Background() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />
      {/* Teal glow — circle at top-right */}
      <LinearGradient
        colors={['rgba(0,210,220,0.20)', 'rgba(0,210,220,0.0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Orange glow — circle at bottom-left */}
      <LinearGradient
        colors={['rgba(255,120,0,0.10)', 'rgba(255,120,0,0.0)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.8, y: 0.3 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
