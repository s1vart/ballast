import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { BottomSheet, Field, Chip, PrimaryButton } from './sheets';
import type { IncomeKind } from '../db';

const KINDS: Array<{ k: IncomeKind; label: string; placeholder: string }> = [
  { k: 'bonus', label: 'Bonus', placeholder: 'Q2 bonus' },
  { k: '1099', label: '1099', placeholder: 'Consulting' },
  { k: 'other', label: 'Other', placeholder: 'Gift' },
];

/** Add a one-off income entry (bonus / 1099 / other). */
export function AddIncomeSheet({
  visible, onClose, onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (f: { kind: IncomeKind; label: string; amount: number }) => void;
}) {
  const [kind, setKind] = useState<IncomeKind>('bonus');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const amt = parseFloat(amount);
  const valid = amt > 0;
  const active = KINDS.find((x) => x.k === kind)!;

  // reset fields each time the sheet opens
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setKind('bonus'); setLabel(''); setAmount(''); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add income">
      <Text style={styles.pickLabel}>Type</Text>
      <View style={styles.chips}>
        {KINDS.map((x) => <Chip key={x.k} label={x.label} selected={kind === x.k} onPress={() => setKind(x.k)} />)}
      </View>
      <Field label="Label" value={label} onChangeText={setLabel} placeholder={active.placeholder} />
      <Field label="Amount" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" money autoFocus />
      <PrimaryButton
        label="Add income"
        disabled={!valid}
        onPress={() => valid && onAdd({ kind, label: label.trim() || active.label, amount: amt })}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pickLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase',
    color: colors.greige, marginTop: 14, marginBottom: 8,
  },
  chips: { flexDirection: 'row', gap: 8 },
});
