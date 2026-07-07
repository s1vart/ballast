import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Standard screen wrapper — USE THIS FOR EVERY SCREEN.
 *
 * Android 15 (the S25) draws edge-to-edge: content goes under the punch-hole
 * camera / status bar and the gesture bar unless we pad by the safe-area
 * insets. The elegant approach: the BACKGROUND flows edge-to-edge (behind the
 * punch-hole and gesture bar), while CONTENT is padded inside the insets.
 *
 * - `edges` controls which sides get inset padding. A screen with its own
 *   bottom tab bar should use edges={['top']} and let the tab bar component
 *   handle the bottom inset itself (so the bar hugs the screen bottom).
 * - RN core's SafeAreaView is iOS-only — never use it here.
 */
export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Array<'top' | 'bottom'>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F7F9' },
});
