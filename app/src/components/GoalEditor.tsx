import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { BottomSheet, Field, PrimaryButton, DangerButton } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import type { Goal } from '../db';

const GOAL_COLORS = ['#1C8C55', '#2D6FB8', '#7F77DD', '#D4537E', '#E9A23B', '#0E5B57'];

/** Add (goal=null) or edit an investment goal. */
export function GoalEditor({
  visible, goal, onClose,
}: {
  visible: boolean; goal: Goal | null; onClose: () => void;
}) {
  const { addGoal, updateGoal, deleteGoal } = useData();
  const { confirm, toast } = useFeedback();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [monthly, setMonthly] = useState('');
  const [color, setColor] = useState(GOAL_COLORS[0]);

  // Reset fields whenever the sheet opens for a different goal.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = visible ? (goal?.id ?? 'new') : 'closed';
  if (key !== lastKey) {
    setLastKey(key);
    setName(goal?.name ?? '');
    setTarget(goal ? String(goal.target) : '');
    setCurrent(goal ? String(goal.current) : '');
    setMonthly(goal ? String(goal.monthly) : '');
    setColor(goal?.color ?? GOAL_COLORS[0]);
  }

  const t = parseFloat(target);
  const c = parseFloat(current);
  const m = parseFloat(monthly);
  const valid = name.trim().length > 0 && t > 0 && c >= 0 && m >= 0;

  const save = async () => {
    if (!valid) return;
    if (goal) await updateGoal(goal.id, { name: name.trim(), target: t, current: c, monthly: m });
    else await addGoal({ name: name.trim(), target: t, current: c, monthly: m, color });
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Emergency Fund" autoFocus />
      <Field label="Target amount" value={target} onChangeText={setTarget} placeholder="25000" keyboardType="decimal-pad" money />
      <Field label="Saved so far" value={current} onChangeText={setCurrent} placeholder="0" keyboardType="decimal-pad" money />
      <Field label="Monthly contribution" value={monthly} onChangeText={setMonthly} placeholder="400" keyboardType="decimal-pad" money />
      {!goal ? (
        <View style={styles.colors}>
          {GOAL_COLORS.map((cc) => (
            <Pressable key={cc} onPress={() => setColor(cc)} style={[styles.swatch, { backgroundColor: cc }, color === cc && styles.swatchOn]} />
          ))}
        </View>
      ) : null}
      <PrimaryButton label={goal ? 'Save goal' : 'Add goal'} disabled={!valid} onPress={save} />
      {goal ? (
        <DangerButton
          label="Delete goal"
          onPress={async () => {
            const ok = await confirm({ title: 'Delete goal', message: `"${goal.name}" will be removed.`, confirmLabel: 'Delete', destructive: true });
            if (ok) { await deleteGoal(goal.id); toast('Goal deleted'); onClose(); }
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  colors: { flexDirection: 'row', gap: 12, marginTop: 16 },
  swatch: { width: 30, height: 30, borderRadius: 8 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
