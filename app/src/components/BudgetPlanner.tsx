import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, money, radius } from '../theme';
import { useData } from '../data/DataContext';
import { useFeedback } from './Feedback';
import { STRATEGIES, StrategyId, computeSuggestions } from '../logic/budgetStrategies';

const parse = (t: string): number => {
  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Guided budget builder: pick a strategy, tweak the suggestions, apply. */
export function BudgetPlanner({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { categories, avgSpendByCategory, monthlyNetIncome, recurring, setBudgets } = useData();
  const { toast } = useFeedback();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [strategyId, setStrategyId] = useState<StrategyId>('spending');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingsTarget, setSavingsTarget] = useState(0);
  const [note, setNote] = useState('');

  const bills = useMemo(() => recurring.reduce((s, b) => s + b.amount, 0), [recurring]);
  const available = Math.max(0, monthlyNetIncome - bills);

  // reset to strategy picker each time it opens
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setStep('pick');
  }

  const choose = (id: StrategyId) => {
    const res = computeSuggestions({
      strategyId: id,
      envelopes: categories.map((c) => ({ id: c.id, name: c.name, monthlyLimit: c.monthlyLimit })),
      avgSpend: avgSpendByCategory,
      takeHome: monthlyNetIncome,
      bills,
    });
    setStrategyId(id);
    setDraft(Object.fromEntries(categories.map((c) => [c.id, String(res.suggested[c.id] ?? 0)])));
    setSavingsTarget(res.savingsTarget);
    setNote(res.note);
    setStep('review');
  };

  const assigned = categories.reduce((s, c) => s + parse(draft[c.id] ?? '0'), 0);
  const remaining = monthlyNetIncome - bills - savingsTarget - assigned;

  const apply = async () => {
    const limits: Record<string, number> = {};
    for (const c of categories) limits[c.id] = Math.round(parse(draft[c.id] ?? '0'));
    await setBudgets(limits);
    toast('Budgets updated');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={step === 'review' ? () => setStep('pick') : onClose} hitSlop={10}>
            <Text style={styles.headerBtn}>{step === 'review' ? '‹ Back' : 'Close'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Plan budgets</Text>
          <View style={{ width: 48 }} />
        </View>

        {step === 'pick' ? (
          <ScrollView contentContainerStyle={styles.pickContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.lead}>Pick a starting strategy. You can fine-tune every number next.</Text>
            {STRATEGIES.map((s) => (
              <Pressable key={s.id} style={({ pressed }) => [styles.stratCard, pressed && styles.pressed]} onPress={() => choose(s.id)}>
                <View style={styles.stratTop}>
                  <Text style={styles.stratName}>{s.name}</Text>
                  <Text style={styles.stratTag}>{s.tagline}</Text>
                </View>
                <Text style={styles.stratDesc}>{s.description}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* running summary */}
            <View style={styles.summary}>
              <Text style={styles.note}>{note}</Text>
              <View style={styles.sumRow}>
                <View>
                  <Text style={styles.sumLabel}>Assigned to envelopes</Text>
                  <Text style={styles.sumBig}>{money(assigned)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.sumLabel}>Savings target</Text>
                  <Text style={styles.sumSavings}>{money(savingsTarget)}</Text>
                </View>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${available > 0 ? Math.min(100, (assigned / available) * 100) : 0}%` }]} />
              </View>
              <Text style={[styles.remaining, { color: remaining >= 0 ? colors.good : colors.bad }]}>
                {remaining >= 0
                  ? `${money(remaining)} left to assign`
                  : `${money(-remaining)} over your take-home`}
              </Text>
            </View>

            <ScrollView contentContainerStyle={styles.rows} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {categories.map((c) => (
                <View key={c.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{c.name}</Text>
                    <Text style={styles.rowAvg}>avg {money(avgSpendByCategory[c.id] ?? 0)}/mo</Text>
                  </View>
                  <View style={styles.amtWrap}>
                    <Text style={styles.amtPrefix}>$</Text>
                    <TextInput
                      style={styles.amtInput}
                      value={draft[c.id] ?? ''}
                      onChangeText={(t) => setDraft((p) => ({ ...p, [c.id]: t }))}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
              <Pressable style={({ pressed }) => [styles.apply, pressed && styles.pressed]} onPress={apply}>
                <Text style={styles.applyTx}>Apply budgets</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { fontSize: 15, fontWeight: '600', color: colors.teal, width: 48 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  pickContent: { padding: 16, gap: 12 },
  lead: { fontSize: 14, color: colors.inkSoft, lineHeight: 20, marginBottom: 2 },
  stratCard: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: 16 },
  pressed: { opacity: 0.85 },
  stratTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  stratName: { fontSize: 17, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  stratTag: { fontSize: 11, fontWeight: '700', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.4 },
  stratDesc: { fontSize: 13, color: colors.inkSoft, lineHeight: 19, marginTop: 6 },
  summary: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  note: { fontSize: 12.5, color: colors.greige, lineHeight: 18, marginBottom: 10 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sumLabel: { fontSize: 11, fontWeight: '600', color: colors.greige, textTransform: 'uppercase', letterSpacing: 0.3 },
  sumBig: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, marginTop: 3 },
  sumSavings: { fontSize: 16, fontWeight: '700', color: colors.teal, marginTop: 5 },
  bar: { height: 8, borderRadius: 6, backgroundColor: colors.line, overflow: 'hidden', marginTop: 12 },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: colors.teal },
  remaining: { fontSize: 12.5, fontWeight: '700', marginTop: 8 },
  rows: { padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowName: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowAvg: { fontSize: 11.5, color: colors.faint, fontWeight: '500', marginTop: 2 },
  amtWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E4E7EB', borderRadius: 12, paddingHorizontal: 12, minWidth: 104 },
  amtPrefix: { fontSize: 16, fontWeight: '700', color: colors.ink },
  amtInput: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink, paddingVertical: 9, paddingLeft: 3, textAlign: 'right' },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  apply: { height: 52, borderRadius: 15, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  applyTx: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
});
