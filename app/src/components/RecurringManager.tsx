import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, money } from '../theme';
import { BottomSheet, Field, PrimaryButton, DangerButton } from './sheets';
import { useData } from '../data/DataContext';
import type { Recurring } from '../logic/finance';

/** Full recurring-bills manager, opened from Home's "See all". */
export function RecurringManager({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { recurring, addRecurring, updateRecurring, deleteRecurring } = useData();
  // null = list view; 'new' or a bill = form view
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);

  const total = useMemo(() => recurring.reduce((s, b) => s + b.amount, 0), [recurring]);

  const close = () => { setEditing(null); onClose(); };

  return (
    <BottomSheet visible={visible} onClose={close} title={editing ? (editing === 'new' ? 'Add a bill' : 'Edit bill') : 'Recurring bills'}>
      {editing ? (
        <BillForm
          bill={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (f) => {
            if (editing === 'new') await addRecurring(f.name, f.category, f.amount, f.dayOfMonth);
            else await updateRecurring(editing.id, f);
            setEditing(null);
          }}
          onDelete={editing !== 'new' ? async () => { await deleteRecurring(editing.id); setEditing(null); } : undefined}
        />
      ) : (
        <View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{recurring.length} bills</Text>
            <Text style={styles.totalAmt}>{money(total)}/mo</Text>
          </View>
          {recurring.map((b) => (
            <Pressable key={b.id} style={styles.row} onPress={() => setEditing(b)}>
              <View style={styles.day}>
                <Text style={styles.dayNum}>{b.dayOfMonth}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{b.name}</Text>
                <Text style={styles.cat}>{b.category}</Text>
              </View>
              <Text style={styles.amt}>{money(b.amount)}</Text>
            </Pressable>
          ))}
          <PrimaryButton label="+ Add bill" onPress={() => setEditing('new')} />
        </View>
      )}
    </BottomSheet>
  );
}

function BillForm({
  bill, onSave, onDelete, onCancel,
}: {
  bill: Recurring | null;
  onSave: (f: { name: string; category: string; amount: number; dayOfMonth: number }) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bill?.name ?? '');
  const [category, setCategory] = useState(bill?.category ?? '');
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [day, setDay] = useState(bill ? String(bill.dayOfMonth) : '');

  const amt = parseFloat(amount);
  const d = parseInt(day, 10);
  const valid = name.trim().length > 0 && amt > 0 && d >= 1 && d <= 31;

  return (
    <View>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Rent" autoFocus />
      <Field label="Category" value={category} onChangeText={setCategory} placeholder="Housing" />
      <Field label="Amount" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" money />
      <Field label="Day of month (1–31)" value={day} onChangeText={setDay} placeholder="1" keyboardType="number-pad" />
      <PrimaryButton
        label={bill ? 'Save bill' : 'Add bill'}
        disabled={!valid}
        onPress={() => valid && onSave({ name: name.trim(), category: category.trim() || 'Other', amount: amt, dayOfMonth: d })}
      />
      {onDelete ? <DangerButton label="Delete bill" onPress={onDelete} /> : null}
      <Pressable style={styles.cancel} onPress={onCancel}><Text style={styles.cancelTx}>Cancel</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  totalLabel: { fontSize: 12.5, color: colors.greige, fontWeight: '600' },
  totalAmt: { fontSize: 14, color: colors.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  day: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  cat: { fontSize: 11.5, color: colors.greige, marginTop: 2 },
  amt: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  cancel: { marginTop: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelTx: { color: colors.greige, fontSize: 15, fontWeight: '600' },
});
