import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, radius, shadow } from '../theme';

/** White rounded card with the standard soft shadow + hairline border. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Money text with tabular (aligned) digits. */
export function Money({ children, style }: { children: React.ReactNode; style?: TextStyle | TextStyle[] }) {
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>{children}</Text>;
}

/** "Section title ..... action" row used above lists. */
export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sechead}>
      <Text style={styles.secheadTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.secheadAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Horizontal progress bar. */
export function HBar({ pct, color, track, height = 8 }: { pct: number; color: string; track?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? colors.line, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/** Donut progress ring with a % label in the middle (Envelopes card style). */
export function ProgressRing({ pct, color, track, textColor, size = 52 }: {
  pct: number; color: string; track: string; textColor: string; size?: number;
}) {
  const r = 26;
  const C = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 1);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 60 60">
        <Circle cx={30} cy={30} r={r} fill="none" stroke={track} strokeWidth={7} />
        <Circle
          cx={30} cy={30} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${C}`}
          strokeDashoffset={C * (1 - clamped)}
          transform="rotate(-90 30 30)"
        />
      </Svg>
      <View style={StyleSheet.absoluteFill as ViewStyle} pointerEvents="none">
        <View style={styles.ringCenter}>
          <Text style={[styles.ringPct, { color: textColor }]}>{Math.round(clamped * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

/** Small colored square swatch used in ledger-style rows. */
export function Swatch({ color }: { color: string }) {
  return <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  sechead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  secheadTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink, letterSpacing: -0.1 },
  secheadAction: { fontSize: 12.5, fontWeight: '600', color: colors.teal },
  ringCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 12, fontWeight: '700' },
});
