import React from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

/** Reusable bottom sheet: scrim + slide-up card, grab handle, title.
 *
 *  Keyboard: statusBarTranslucent modals on Android do NOT auto-resize for the
 *  keyboard, so we use KeyboardAvoidingView 'padding' on BOTH platforms — the
 *  sheet lifts above the keyboard and its content compresses.
 *
 *  `scroll={false}` renders children in a shrinkable View instead of the
 *  built-in ScrollView — use it when a child manages its own scrolling
 *  (e.g. the state picker's list), so scrollables don't nest. */
export function BottomSheet({
  visible, onClose, title, children, scroll = true,
}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) + 10 }]}>
          <View style={styles.grab} />
          <Text style={styles.title}>{title}</Text>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            <View style={styles.shrink}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Labeled text/number field. */
export function Field({
  label, value, onChangeText, placeholder, keyboardType, money, autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  money?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        {money ? <Text style={styles.dollar}>$</Text> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          keyboardType={keyboardType ?? 'default'}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.primary, disabled && styles.primaryDisabled, pressed && !disabled && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryTx}>{label}</Text>
    </Pressable>
  );
}

export function DangerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.danger, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.dangerTx}>{label}</Text>
    </Pressable>
  );
}

/** Selectable pill (category / kind pickers). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}>
      <Text style={[styles.chipTx, selected ? styles.chipTxOn : styles.chipTxOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '86%',
  },
  grab: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#DADEE2', alignSelf: 'center', marginBottom: 14 },
  shrink: { flexShrink: 1 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: colors.ink, marginBottom: 6 },
  fieldWrap: { marginTop: 14 },
  fieldLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase',
    color: colors.greige, marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E4E7EB', borderRadius: 14, paddingHorizontal: 15,
  },
  dollar: { fontSize: 20, fontWeight: '700', color: colors.ink },
  input: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.ink, paddingVertical: 13, paddingLeft: 4 },
  primary: {
    marginTop: 20, height: 52, borderRadius: 15, backgroundColor: colors.teal,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryTx: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  danger: { marginTop: 12, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dangerTx: { color: colors.bad, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  chip: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1.5 },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipOff: { backgroundColor: colors.card, borderColor: '#E4E7EB' },
  chipTx: { fontSize: 12.5, fontWeight: '600' },
  chipTxOn: { color: '#fff' },
  chipTxOff: { color: '#374151' },
});
