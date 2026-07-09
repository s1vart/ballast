import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, money, paletteFor, ringPalette, ACCENT_COLORS } from '../theme';
import { BottomSheet, Field, PrimaryButton, DangerButton } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import type { Category } from '../db';

/** Envelope (budget category) manager: add / rename / re-limit / delete. */
export function EnvelopeManager({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { categories, spentByCategory, addCategory, updateCategory, deleteCategory } = useData();
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const close = () => { setEditing(null); onClose(); };

  return (
    <BottomSheet visible={visible} onClose={close} title={editing ? (editing === 'new' ? 'New envelope' : 'Edit envelope') : 'Envelopes'}>
      {editing ? (
        <EnvelopeForm
          cat={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (f) => {
            if (editing === 'new') { await addCategory(f.name, f.monthlyLimit, f.color); toast('Envelope added'); }
            else { await updateCategory(editing.id, f); toast('Envelope updated'); }
            setEditing(null);
          }}
          onDelete={editing !== 'new' ? async () => {
            const spent = spentByCategory[editing.id] ?? 0;
            const ok = await confirm({
              title: 'Delete envelope',
              message: `"${editing.name}" and its expenses${spent > 0 ? ` (${money(spent)} this month)` : ''} will be removed.`,
              confirmLabel: 'Delete',
              destructive: true,
            });
            if (ok) { await deleteCategory(editing.id); toast('Envelope deleted'); setEditing(null); }
          } : undefined}
        />
      ) : (
        <View>
          {categories.length === 0 ? (
            <Text style={styles.empty}>No envelopes yet. Add one per spending category — groceries, dining out, gas…</Text>
          ) : (
            categories.map((c) => {
              const pal = c.color ? ringPalette(c.color) : paletteFor(c.id);
              return (
                <Pressable key={c.id} style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => setEditing(c)}>
                  <View style={[styles.dot, { backgroundColor: pal.c }]} />
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.limit}>{money(c.monthlyLimit)}/mo</Text>
                </Pressable>
              );
            })
          )}
          <PrimaryButton label="+ Add envelope" onPress={() => setEditing('new')} />
        </View>
      )}
    </BottomSheet>
  );
}

function EnvelopeForm({
  cat, onSave, onDelete, onCancel,
}: {
  cat: Category | null;
  onSave: (f: { name: string; monthlyLimit: number; color: string }) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(cat?.name ?? '');
  const [limit, setLimit] = useState(cat ? String(cat.monthlyLimit) : '');
  const [color, setColor] = useState<string>(cat?.color ?? ACCENT_COLORS[0]);
  const parsed = parseFloat(limit);
  const valid = name.trim().length > 0 && parsed > 0;

  return (
    <View>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Groceries" autoFocus={!cat} />
      <Field label="Monthly budget" value={limit} onChangeText={setLimit} placeholder="0" keyboardType="decimal-pad" money />
      <Text style={styles.section}>Color</Text>
      <View style={styles.swatches}>
        {ACCENT_COLORS.map((cc) => (
          <Pressable key={cc} onPress={() => setColor(cc)} style={[styles.swatch, { backgroundColor: cc }, color === cc && styles.swatchOn]} />
        ))}
      </View>
      <PrimaryButton
        label={cat ? 'Save envelope' : 'Add envelope'}
        disabled={!valid}
        onPress={() => valid && onSave({ name: name.trim(), monthlyLimit: parsed, color })}
      />
      {onDelete ? <DangerButton label="Delete envelope" onPress={onDelete} /> : null}
      <Pressable style={styles.cancel} onPress={onCancel}><Text style={styles.cancelTx}>Cancel</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, paddingVertical: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  pressed: { opacity: 0.7 },
  dot: { width: 12, height: 12, borderRadius: 4 },
  name: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.ink },
  limit: { fontSize: 13.5, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  cancel: { marginTop: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelTx: { color: colors.greige, fontSize: 15, fontWeight: '600' },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: colors.greige, marginTop: 16, marginBottom: 10 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 30, height: 30, borderRadius: 8 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
