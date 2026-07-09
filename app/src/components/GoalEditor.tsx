import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, money, ACCENT_COLORS } from '../theme';
import { BottomSheet, Field, Chip, PrimaryButton, DangerButton } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import { isLiability, displayName } from '../types';
import { contributionFor } from '../logic/recurringTransfers';
import { requiredMonthly } from '../logic/goals';
import type { Goal } from '../db';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toIso = (y: number, m1: number): string => `${y}-${String(m1).padStart(2, '0')}-01`; // m1 = 1..12
const addMonthsIso = (iso: string, n: number): string => {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return toIso(Math.floor(total / 12), (total % 12) + 1);
};
const fmtMonthIso = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

type ContribMode = 'amount' | 'date' | 'auto';

/** Add (goal=null) or edit a goal. Contribution can be a set amount, a target
 *  date (monthly computed), or an auto-detected recurring transfer. Progress can
 *  track a linked account's live balance. */
export function GoalEditor({ visible, goal, onClose }: { visible: boolean; goal: Goal | null; onClose: () => void }) {
  const { addGoal, updateGoal, deleteGoal, accounts, recurringTransfers, today } = useData();
  const { confirm, toast } = useFeedback();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [monthly, setMonthly] = useState('');
  const [color, setColor] = useState<string>(ACCENT_COLORS[0]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [contributionKey, setContributionKey] = useState<string | null>(null);
  const [mode, setMode] = useState<ContribMode>('amount');
  const [targetDate, setTargetDate] = useState<string>(toIso(today.getFullYear() + 1, today.getMonth() + 1));

  const nextMonthIso = addMonthsIso(toIso(today.getFullYear(), today.getMonth() + 1), 1); // earliest allowed target

  // Reset fields whenever the sheet opens for a different goal.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = visible ? (goal?.id ?? 'new') : 'closed';
  if (key !== lastKey) {
    setLastKey(key);
    setName(goal?.name ?? '');
    setTarget(goal ? String(goal.target) : '');
    setCurrent(goal ? String(goal.current) : '');
    setMonthly(goal ? String(goal.monthly) : '');
    setColor(goal?.color ?? ACCENT_COLORS[0]);
    setAccountId(goal?.accountId ?? null);
    setContributionKey(goal?.contributionKey ?? null);
    setMode(goal?.targetDate ? 'date' : goal?.contributionKey ? 'auto' : 'amount');
    setTargetDate(goal?.targetDate ?? toIso(today.getFullYear() + 1, today.getMonth() + 1));
  }

  const assets = accounts.filter((a) => !isLiability(a));
  const linkedAcct = assets.find((a) => a.id === accountId) ?? null;
  const detectedMonthly = contributionFor(contributionKey, recurringTransfers);

  const t = parseFloat(target);
  const c = linkedAcct ? (linkedAcct.balance ?? 0) : parseFloat(current);
  const byDateMonthly = t > 0 ? requiredMonthly(t, Number.isFinite(c) ? c : 0, targetDate, today) : 0;
  const m = mode === 'date' ? byDateMonthly : mode === 'auto' ? (detectedMonthly ?? 0) : parseFloat(monthly);
  const valid = name.trim().length > 0 && t > 0 && (linkedAcct != null || c >= 0) && (mode !== 'amount' || m >= 0);

  const bumpMonths = (n: number) => {
    const next = addMonthsIso(targetDate, n);
    if (next >= nextMonthIso) setTargetDate(next); // never before next month
  };

  const save = async () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      target: t,
      current: linkedAcct ? (linkedAcct.balance ?? 0) : (Number.isFinite(c) ? c : 0),
      monthly: Number.isFinite(m) ? m : 0,
      accountId: accountId ?? null,
      contributionKey: mode === 'auto' ? contributionKey : null,
      targetDate: mode === 'date' ? targetDate : null,
      color,
    };
    if (goal) await updateGoal(goal.id, payload);
    else await addGoal(payload);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} scroll>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Roth IRA" autoFocus />
      <Field label="Target amount" value={target} onChangeText={setTarget} placeholder="25000" keyboardType="decimal-pad" money />

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

      <Text style={styles.section}>Monthly contribution</Text>
      <View style={styles.chips}>
        <Chip label="Set amount" selected={mode === 'amount'} onPress={() => setMode('amount')} />
        <Chip label="By date" selected={mode === 'date'} onPress={() => setMode('date')} />
        <Chip label="Auto from transfer" selected={mode === 'auto'} onPress={() => setMode('auto')} />
      </View>

      {mode === 'amount' ? (
        <Field label="Amount / month" value={monthly} onChangeText={setMonthly} placeholder="500" keyboardType="decimal-pad" money />
      ) : mode === 'date' ? (
        <>
          <View style={styles.chips}>
            {[1, 2, 3, 5].map((yr) => (
              <Chip key={yr} label={`${yr} yr${yr > 1 ? 's' : ''}`}
                selected={targetDate === toIso(today.getFullYear() + yr, today.getMonth() + 1)}
                onPress={() => setTargetDate(toIso(today.getFullYear() + yr, today.getMonth() + 1))} />
            ))}
          </View>
          <View style={styles.stepper}>
            <Pressable onPress={() => bumpMonths(-1)} hitSlop={10} style={styles.step}><Text style={styles.stepTx}>‹</Text></Pressable>
            <Text style={styles.stepDate}>{fmtMonthIso(targetDate)}</Text>
            <Pressable onPress={() => bumpMonths(1)} hitSlop={10} style={styles.step}><Text style={styles.stepTx}>›</Text></Pressable>
          </View>
          {t > 0 ? (
            <Text style={styles.note}>≈ <Text style={styles.noteBold}>{money(byDateMonthly)}/mo</Text> to reach {money(t)} by {fmtMonthIso(targetDate)}{linkedAcct ? ' (adjusts as the balance grows)' : ''}.</Text>
          ) : (
            <Text style={styles.note}>Enter a target amount to see the monthly needed.</Text>
          )}
        </>
      ) : (
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
      )}

      <Text style={styles.section}>Color</Text>
      <View style={styles.colors}>
        {ACCENT_COLORS.map((cc) => (
          <Pressable key={cc} onPress={() => setColor(cc)} style={[styles.swatch, { backgroundColor: cc }, color === cc && styles.swatchOn]} />
        ))}
      </View>

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
  noteBold: { fontWeight: '800', color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 6, height: 46 },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepTx: { fontSize: 26, fontWeight: '700', color: colors.teal, marginTop: -2 },
  stepDate: { fontSize: 15, fontWeight: '700', color: colors.ink },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  swatch: { width: 30, height: 30, borderRadius: 8 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
