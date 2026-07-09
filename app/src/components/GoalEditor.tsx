import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, money } from '../theme';
import { BottomSheet, Field, Chip, PrimaryButton, DangerButton } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import { isLiability, displayName } from '../types';
import { contributionFor } from '../logic/recurringTransfers';
import type { Goal } from '../db';

const GOAL_COLORS = ['#1C8C55', '#2D6FB8', '#7F77DD', '#D4537E', '#E9A23B', '#0E5B57'];

/** Add (goal=null) or edit a goal. A goal can link to a real account (progress
 *  tracks its live balance) and to a recurring transfer (its monthly contribution). */
export function GoalEditor({ visible, goal, onClose }: { visible: boolean; goal: Goal | null; onClose: () => void }) {
  const { addGoal, updateGoal, deleteGoal, accounts, recurringTransfers } = useData();
  const { confirm, toast } = useFeedback();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [monthly, setMonthly] = useState('');
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [contributionKey, setContributionKey] = useState<string | null>(null);
  const [autoContribution, setAutoContribution] = useState(false);

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
    setAccountId(goal?.accountId ?? null);
    setContributionKey(goal?.contributionKey ?? null);
    setAutoContribution(!!goal?.contributionKey);
  }

  const assets = accounts.filter((a) => !isLiability(a)); // cash + investments can back a goal
  const linkedAcct = assets.find((a) => a.id === accountId) ?? null;
  const detectedMonthly = contributionFor(contributionKey, recurringTransfers);

  const t = parseFloat(target);
  const c = linkedAcct ? (linkedAcct.balance ?? 0) : parseFloat(current);
  const m = autoContribution ? (detectedMonthly ?? 0) : parseFloat(monthly);
  const valid = name.trim().length > 0 && t > 0 && (linkedAcct != null || c >= 0) && (autoContribution || m >= 0);

  const save = async () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      target: t,
      current: linkedAcct ? (linkedAcct.balance ?? 0) : (Number.isFinite(c) ? c : 0),
      monthly: autoContribution ? (detectedMonthly ?? 0) : (Number.isFinite(m) ? m : 0),
      accountId: accountId ?? null,
      contributionKey: autoContribution ? contributionKey : null,
    };
    if (goal) await updateGoal(goal.id, payload);
    else await addGoal({ ...payload, color });
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} scroll>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Roth IRA" autoFocus />
      <Field label="Target amount" value={target} onChangeText={setTarget} placeholder="25000" keyboardType="decimal-pad" money />

      {/* Link to a real account -> progress tracks its live balance */}
      <Text style={styles.section}>Track progress from</Text>
      <View style={styles.chips}>
        <Chip label="Manual number" selected={accountId === null} onPress={() => setAccountId(null)} />
        {assets.map((a) => (
          <Chip key={a.id} label={displayName(a)} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
        ))}
      </View>
      {linkedAcct ? (
        <Text style={styles.note}>Progress reads {displayName(linkedAcct)}'s balance ({money(linkedAcct.balance)}), updated on every sync.</Text>
      ) : (
        <Field label="Saved so far" value={current} onChangeText={setCurrent} placeholder="0" keyboardType="decimal-pad" money />
      )}

      {/* Monthly contribution: manual, or auto from a detected recurring transfer */}
      <Text style={styles.section}>Monthly contribution</Text>
      <View style={styles.chips}>
        <Chip label="Set amount" selected={!autoContribution} onPress={() => setAutoContribution(false)} />
        <Chip label="Auto from a transfer" selected={autoContribution} onPress={() => setAutoContribution(true)} />
      </View>
      {autoContribution ? (
        recurringTransfers.length > 0 ? (
          <>
            <View style={styles.chips}>
              {recurringTransfers.map((r) => (
                <Chip key={r.key} label={`${r.label} · ${money(r.monthly)}`} selected={contributionKey === r.key} onPress={() => setContributionKey(r.key)} />
              ))}
            </View>
            {contributionKey && detectedMonthly != null ? (
              <Text style={styles.note}>Using {money(detectedMonthly)}/mo from this recurring transfer — updates as new ones post.</Text>
            ) : (
              <Text style={styles.note}>Pick the recurring transfer that funds this goal.</Text>
            )}
          </>
        ) : (
          <Text style={styles.note}>No recurring transfers detected yet. Once your deposit runs a couple of times, it'll show up here to select.</Text>
        )
      ) : (
        <Field label="Amount / month" value={monthly} onChangeText={setMonthly} placeholder="500" keyboardType="decimal-pad" money />
      )}

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
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: colors.greige, marginTop: 18, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontSize: 12.5, color: colors.greige, lineHeight: 18, marginTop: 10 },
  colors: { flexDirection: 'row', gap: 12, marginTop: 18 },
  swatch: { width: 30, height: 30, borderRadius: 8 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
