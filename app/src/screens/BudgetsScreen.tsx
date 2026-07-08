// BudgetsScreen — the Envelopes screen, ported from the approved prototype
// ("panels.budgets"). All figures come live from useData(); nothing is hardcoded.

import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, paletteFor, radius, money } from '../theme';
import { Card, Money, SectionHead, HBar, ProgressRing } from '../components/ui';
import { EnvelopeManager } from '../components/EnvelopeManager';
import { TransactionsList } from '../components/TransactionsList';
import { BudgetPlanner } from '../components/BudgetPlanner';
import { useData } from '../data/DataContext';
import type { Category } from '../db';

// ---------- derived color constants (no new hex values — all from theme) ----------
const WHITE = colors.card; // #FFFFFF — white text/surfaces on teal
// Translucent tints from the prototype's teal summary card & sheet scrim,
// expressed as alpha overlays of theme colors rather than new hex literals.
const TEAL_FADE_TEXT = 'rgba(255,255,255,0.72)'; // proto #9FD3CD (light teal label)
const TEAL_FADE_SOFT = 'rgba(255,255,255,0.75)'; // proto #B9DAD6 (footer text)
const PILL_BG = 'rgba(255,255,255,0.14)'; // "Left to spend" pill
const TRACK_BG = 'rgba(255,255,255,0.16)'; // progress bar track
const BACKDROP = colors.scrim;
const OVER_BG = `${colors.bad}1F`; // colors.bad @ ~12% — "over" pill tint

// ---------- icons (ported inline per prototype convention) ----------
function PlusIcon({ size = 15, color = WHITE }: { size?: number; color?: string }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

// ---------- envelope card (one grid cell) ----------
function EnvelopeCard({ cat, spent }: { cat: Category; spent: number }): React.ReactElement {
  const pal = paletteFor(cat.id);
  const limit = cat.monthlyLimit;
  const pct = limit > 0 ? spent / limit : 0;
  const over = spent > limit;
  return (
    <Card style={styles.ec}>
      <View style={styles.ecTop}>
        <ProgressRing pct={pct} color={pal.c} track={pal.track} textColor={pal.tx} />
        <View style={[styles.cpill, { backgroundColor: over ? OVER_BG : pal.track }]}>
          <Money style={[styles.cpillText, { color: over ? colors.bad : pal.tx }]}>
            {over ? `${money(spent - limit)} over` : `${money(limit - spent)} left`}
          </Money>
        </View>
      </View>
      <Text style={styles.ecName}>{cat.name}</Text>
      <Text style={styles.ecCaption}>
        <Money style={styles.ecCaptionSpent}>{money(spent)}</Money> of <Money>{money(limit)}</Money>
      </Text>
    </Card>
  );
}

// ---------- screen ----------
export function BudgetsScreen(): React.ReactElement {
  const { categories, spentByCategory, daysLeft, addExpense } = useData();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [selCat, setSelCat] = useState('');
  const [amt, setAmt] = useState('');

  const totals = useMemo(() => {
    const budget = categories.reduce((s, c) => s + c.monthlyLimit, 0);
    const spent = Object.values(spentByCategory).reduce((s, v) => s + v, 0);
    const pct = budget > 0 ? spent / budget : 0; // guard ÷0
    return { budget, spent, pct };
  }, [categories, spentByCategory]);

  const openSheet = useCallback(() => {
    // Default the envelope selection to the first category if none valid.
    setSelCat((cur) => (categories.some((c) => c.id === cur) ? cur : categories[0]?.id ?? ''));
    setSheetOpen(true);
  }, [categories]);

  const closeSheet = useCallback(() => { setSheetOpen(false); setAmt(''); }, []);

  const amount = Number.parseFloat(amt);
  const canSubmit = selCat !== '' && Number.isFinite(amount) && amount > 0;

  const submit = useCallback(async () => {
    const n = Number.parseFloat(amt);
    if (!selCat || !Number.isFinite(n) || n <= 0) return; // ignore invalid submits
    await addExpense(selCat, n);
    setAmt('');
    setSheetOpen(false);
  }, [addExpense, amt, selCat]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Teal summary card */}
        <View style={styles.summary}>
          <View style={styles.sumRow}>
            <View>
              <Text style={styles.sumLabel}>SPENT THIS MONTH</Text>
              <Money style={styles.sumBig}>
                {money(totals.spent)}
                <Text style={styles.sumBigSmall}> / {money(totals.budget)}</Text>
              </Money>
            </View>
            <View style={styles.sumPill}>
              <Text style={styles.sumPillLabel}>Left to spend</Text>
              <Money style={styles.sumPillValue}>{money(totals.budget - totals.spent)}</Money>
            </View>
          </View>
          <View style={styles.sumBar}>
            <HBar pct={totals.pct * 100} color={colors.tealBright} track={TRACK_BG} height={8} />
          </View>
          <View style={styles.sumFoot}>
            <Text style={styles.sumFootText}>
              <Text style={styles.sumFootBold}>{Math.round(totals.pct * 100)}%</Text> of budget used
            </Text>
            <Text style={styles.sumFootText}>
              <Text style={styles.sumFootBold}>{daysLeft} days</Text> to go
            </Text>
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.planBtn, pressed && styles.fabPressed]} onPress={() => setPlanning(true)}>
          <Text style={styles.planTx}>✨  Suggest budgets</Text>
        </Pressable>

        {/* Envelopes grid */}
        <SectionHead title="Envelopes" action={categories.length === 0 ? '+ Add' : 'Manage'} onAction={() => setManaging(true)} />
        {categories.length === 0 ? (
          <Pressable style={({ pressed }) => [styles.emptyCard, pressed && styles.fabPressed]} onPress={() => setManaging(true)}>
            <Text style={styles.emptyTitle}>No envelopes yet</Text>
            <Text style={styles.emptySub}>
              Add one per spending category — groceries, dining out, gas — each with a monthly budget. Tap to start.
            </Text>
          </Pressable>
        ) : (
          <View style={styles.grid}>
            {categories.map((cat) => (
              <EnvelopeCard key={cat.id} cat={cat} spent={spentByCategory[cat.id] ?? 0} />
            ))}
          </View>
        )}

        <TransactionsList />
      </ScrollView>

      <EnvelopeManager visible={managing} onClose={() => setManaging(false)} />
      <BudgetPlanner visible={planning} onClose={() => setPlanning(false)} />

      {/* Floating "+ Add expense" button */}
      {categories.length > 0 ? (
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          onPress={openSheet}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <PlusIcon />
          <Text style={styles.fabText}>Add expense</Text>
        </Pressable>
      </View>
      ) : null}

      {/* Add-expense bottom sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={closeSheet} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.grab} />
              <Text style={styles.sheetTitle}>Add an expense</Text>

              <Text style={styles.fieldLabel}>ENVELOPE</Text>
              <View style={styles.catRow}>
                {categories.map((c) => {
                  const sel = c.id === selCat;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setSelCat(c.id)}
                      style={({ pressed }) => [
                        styles.catBtn,
                        sel && styles.catBtnSel,
                        pressed && styles.catBtnPressed,
                      ]}
                    >
                      <Text style={[styles.catBtnText, sel && styles.catBtnTextSel]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>AMOUNT</Text>
              <View style={styles.amtWrap}>
                <Text style={styles.amtPrefix}>$</Text>
                <TextInput
                  style={styles.amtInput}
                  value={amt}
                  onChangeText={setAmt}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.faint}
                />
              </View>

              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.go,
                  !canSubmit && styles.goDisabled,
                  pressed && canSubmit && styles.goPressed,
                ]}
              >
                <Text style={styles.goText}>Add to envelope</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  // --- teal summary card ---
  summary: {
    marginTop: 6,
    backgroundColor: colors.teal,
    borderRadius: radius.hero,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 17,
    shadowColor: colors.teal,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sumLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: TEAL_FADE_TEXT },
  sumBig: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29, marginTop: 3, color: WHITE },
  sumBigSmall: { fontSize: 15, fontWeight: '600', letterSpacing: 0, color: TEAL_FADE_TEXT },
  sumPill: {
    backgroundColor: PILL_BG,
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 11,
    alignItems: 'flex-end',
  },
  sumPillLabel: { fontSize: 10, fontWeight: '600', color: TEAL_FADE_TEXT },
  sumPillValue: { fontSize: 15, fontWeight: '700', marginTop: 2, color: WHITE },
  sumBar: { marginTop: 14 },
  sumFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  sumFootText: { fontSize: 11, fontWeight: '500', color: TEAL_FADE_SOFT },
  sumFootBold: { fontWeight: '700', color: WHITE },

  // --- envelopes grid ---
  // SectionHead carries marginBottom 10; +2 here = the prototype's 12px gap.
  planBtn: { marginTop: 12, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintBg },
  planTx: { color: colors.teal, fontSize: 14.5, fontWeight: '800', letterSpacing: -0.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 11, marginTop: 2 },
  ec: { width: '48.4%', paddingTop: 13, paddingHorizontal: 13, paddingBottom: 12 },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
    padding: 20, alignItems: 'center', marginTop: 2,
  },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: colors.ink },
  emptySub: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  ecTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cpill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 9 },
  cpillText: { fontSize: 10, fontWeight: '700' },
  ecName: { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2, marginTop: 11, color: colors.ink },
  ecCaption: { fontSize: 11, fontWeight: '500', marginTop: 3, color: colors.greige },
  ecCaptionSpent: { fontWeight: '700', color: colors.ink },

  // --- FAB ---
  fabWrap: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 50,
    paddingHorizontal: 22,
    borderRadius: 26,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabPressed: { transform: [{ scale: 0.96 }] },
  fabText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, color: WHITE },

  // --- add-expense sheet ---
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: BACKDROP },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 22,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -10 },
    elevation: 14,
  },
  grab: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginTop: 16, marginBottom: 8, color: colors.greige },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catBtn: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  catBtnSel: { borderColor: colors.teal, backgroundColor: colors.teal },
  catBtnPressed: { opacity: 0.85 },
  catBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.inkMid },
  catBtnTextSel: { color: WHITE },
  amtWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 15,
    marginTop: 2,
  },
  amtPrefix: { fontSize: 22, fontWeight: '700', color: colors.ink },
  amtInput: { flex: 1, fontSize: 22, fontWeight: '700', paddingVertical: 14, paddingHorizontal: 6, color: colors.ink },
  go: { marginTop: 18, height: 52, borderRadius: 15, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  goDisabled: { opacity: 0.45 },
  goPressed: { opacity: 0.9 },
  goText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: WHITE },
});
