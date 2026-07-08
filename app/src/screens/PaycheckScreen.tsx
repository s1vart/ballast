import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, money, ymd } from '../theme';
import { Card, Money, SectionHead, HBar, Swatch } from '../components/ui';
import { AddIncomeSheet } from '../components/AddIncomeSheet';
import { useData } from '../data/DataContext';
import type { PaycheckConfig } from '../logic/finance';

// ---------- inline icons (ported from prototype SVG paths) ----------

function CheckIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17l-5-5"
        stroke={colors.green}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MinusIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14" stroke={colors.teal} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={colors.teal}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ---------- screen ----------

const CONTRIB_MIN = 0;
const CONTRIB_MAX = 20;
const TAX_MIN = 0;
const TAX_MAX = 60;

type EditField = 'salary' | 'tax' | null;

export function PaycheckScreen() {
  const { paycheckConfig, breakdown, updatePaycheck, income, projectedAnnualIncome, addIncome, deleteIncome, today } = useData();
  const [editing, setEditing] = useState<EditField>(null);
  const [draft, setDraft] = useState('');
  const [addingIncome, setAddingIncome] = useState(false);

  const contribPct = paycheckConfig.contribPct;
  // Visual scale of the stepper: contribPct out of CONTRIB_MAX, as 0–100 for HBar.
  const scalePct = CONTRIB_MAX > 0 ? (Math.min(Math.max(contribPct, 0), CONTRIB_MAX) / CONTRIB_MAX) * 100 : 0;

  const commit = (cfg: PaycheckConfig) => {
    void updatePaycheck(cfg);
  };

  const step = (dir: 1 | -1) => {
    const next = Math.min(CONTRIB_MAX, Math.max(CONTRIB_MIN, contribPct + dir));
    if (next !== contribPct) commit({ ...paycheckConfig, contribPct: next });
  };

  const openSalary = () => {
    setDraft(String(paycheckConfig.grossAnnual));
    setEditing('salary');
  };

  const openTax = () => {
    setDraft(String(paycheckConfig.taxPct));
    setEditing('tax');
  };

  const closeEdit = () => setEditing(null);

  const cleaned = draft.replace(/[^0-9.]/g, '');
  const draftNum = cleaned.length > 0 ? Number(cleaned) : NaN;
  const draftValid =
    editing === 'salary'
      ? Number.isFinite(draftNum) && draftNum > 0
      : Number.isFinite(draftNum) && draftNum >= 0;

  const saveEdit = () => {
    if (!draftValid) return;
    if (editing === 'salary') {
      commit({ ...paycheckConfig, grossAnnual: draftNum });
    } else if (editing === 'tax') {
      commit({ ...paycheckConfig, taxPct: Math.min(TAX_MAX, Math.max(TAX_MIN, draftNum)) });
    }
    setEditing(null);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SectionHead title="Paycheck & 401(k)" />

      <Card style={styles.pkCard}>
        <Text style={styles.cardLabel}>Monthly take-home</Text>
        <View style={styles.netRow}>
          <Money style={styles.net}>{money(breakdown.net)}</Money>
          <Text style={styles.netLabel}>after 401(k) + taxes</Text>
        </View>

        {/* 401(k) stepper */}
        <View style={styles.stepperBox}>
          <View style={styles.stepperTop}>
            <Text style={styles.stepperTitle}>401(k) contribution</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => step(-1)}
                disabled={contribPct <= CONTRIB_MIN}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Decrease 401(k) contribution"
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && styles.stepBtnPressed,
                  contribPct <= CONTRIB_MIN && styles.stepBtnDisabled,
                ]}
              >
                <MinusIcon />
              </Pressable>
              <Text style={styles.stepValue}>{contribPct}%</Text>
              <Pressable
                onPress={() => step(1)}
                disabled={contribPct >= CONTRIB_MAX}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Increase 401(k) contribution"
                style={({ pressed }) => [
                  styles.stepBtn,
                  pressed && styles.stepBtnPressed,
                  contribPct >= CONTRIB_MAX && styles.stepBtnDisabled,
                ]}
              >
                <PlusIcon />
              </Pressable>
            </View>
          </View>
          <View style={styles.stepperBar}>
            <HBar pct={scalePct} color={colors.teal} height={8} />
          </View>
          <View style={styles.scaleRow}>
            <Text style={styles.scaleText}>0%</Text>
            <Text style={styles.scaleText}>10%</Text>
            <Text style={styles.scaleText}>20%</Text>
          </View>
        </View>

        {/* breakdown */}
        <View style={styles.breakdown}>
          <View style={styles.lrow}>
            <View style={styles.lb}>
              <Text style={styles.lbText}>Gross (monthly)</Text>
            </View>
            <Money style={styles.lv}>{money(breakdown.grossMonthly)}</Money>
          </View>
          <View style={styles.lrow}>
            <View style={styles.lb}>
              <Swatch color={colors.green} />
              <Text style={styles.lbText}>401(k) contribution</Text>
            </View>
            <Money style={[styles.lv, styles.neg]}>{money(-breakdown.contrib)}</Money>
          </View>
          <View style={styles.lrow}>
            <View style={styles.lb}>
              <Swatch color={colors.bad} />
              <Text style={styles.lbText}>Est. taxes + FICA</Text>
            </View>
            <Money style={[styles.lv, styles.neg]}>{money(-breakdown.taxes)}</Money>
          </View>
          <View style={[styles.lrow, styles.lrowTot]}>
            <View style={styles.lb}>
              <Text style={styles.lbTotText}>Take-home</Text>
            </View>
            <Money style={styles.lvTot}>{money(breakdown.net)}</Money>
          </View>
        </View>

        {/* employer match note */}
        <View style={styles.matchNote}>
          <CheckIcon />
          <Text style={styles.matchText}>
            Employer adds <Money style={styles.matchBold}>{money(breakdown.match)}/mo</Money> (
            {paycheckConfig.matchPct}% match) ·{' '}
            <Money style={styles.matchBold}>{money(breakdown.annual401k)}/yr</Money> total into
            401(k)
          </Text>
        </View>
      </Card>

      <SectionHead title="Income this year" action="+ Add" onAction={() => setAddingIncome(true)} />
      <View style={styles.incGrid}>
        <Pressable
          onPress={openSalary}
          accessibilityRole="button"
          accessibilityLabel="Edit base salary"
          style={({ pressed }) => [styles.incPress, pressed && styles.pressedDim]}
        >
          <Card style={styles.incCard}>
            <Text style={styles.incLabel}>Base salary</Text>
            <Money style={styles.incValue}>{money(paycheckConfig.grossAnnual)}</Money>
            <Text style={styles.incCaption}>{money(breakdown.grossMonthly)} / mo gross</Text>
          </Card>
        </Pressable>
        <Pressable
          onPress={openTax}
          accessibilityRole="button"
          accessibilityLabel="Edit effective tax rate"
          style={({ pressed }) => [styles.incPress, pressed && styles.pressedDim]}
        >
          <Card style={styles.incCard}>
            <Text style={styles.incLabel}>Eff. tax + FICA</Text>
            <Money style={styles.incValue}>{paycheckConfig.taxPct}%</Money>
            <Text style={styles.incCaption}>applied after 401(k)</Text>
          </Card>
        </Pressable>
        {income.map((i) => (
          <Pressable
            key={i.id}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${i.label}`}
            onPress={() =>
              Alert.alert('Delete income', `Remove "${i.label}" (${money(i.amount)})?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteIncome(i.id) },
              ])
            }
            style={({ pressed }) => [styles.incPress, pressed && styles.pressedDim]}
          >
            <Card style={styles.incCard}>
              <Text style={styles.incLabel}>{i.label}</Text>
              <Money style={styles.incValue}>{money(i.amount)}</Money>
              <Text style={styles.incCaption}>{i.kind === '1099' ? '1099' : i.kind.charAt(0).toUpperCase() + i.kind.slice(1)} · {i.date.slice(0, 7)}</Text>
            </Card>
          </Pressable>
        ))}
        <View style={styles.incPress}>
          <Card style={styles.incCard}>
            <Text style={styles.incLabel}>Projected {today.getFullYear()}</Text>
            <Money style={[styles.incValue, { color: colors.teal }]}>{money(projectedAnnualIncome)}</Money>
            <Text style={styles.incCaption}>gross total</Text>
          </Card>
        </View>
      </View>

      <AddIncomeSheet
        visible={addingIncome}
        onClose={() => setAddingIncome(false)}
        onAdd={async (f) => { await addIncome({ ...f, date: ymd(today) }); setAddingIncome(false); }}
      />

      {/* edit modal (salary / tax) */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEdit} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing === 'salary' ? 'Base salary' : 'Eff. tax + FICA'}
            </Text>
            <Text style={styles.modalLabel}>
              {editing === 'salary' ? 'Gross annual' : `Percent of gross (${TAX_MIN}–${TAX_MAX})`}
            </Text>
            <View style={styles.amtWrap}>
              {editing === 'salary' ? <Text style={styles.amtSymbol}>$</Text> : null}
              <TextInput
                style={styles.amtInput}
                value={draft}
                onChangeText={setDraft}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEdit}
                placeholder="0"
                placeholderTextColor={colors.faint}
              />
              {editing === 'tax' ? <Text style={styles.amtSymbol}>%</Text> : null}
            </View>
            <Pressable
              onPress={saveEdit}
              disabled={!draftValid}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && styles.pressedDim,
                !draftValid && styles.saveBtnDisabled,
              ]}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- styles ----------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  // main card (proto .pkcard)
  pkCard: { paddingTop: 17, paddingHorizontal: 17, paddingBottom: 20 },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.greige,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  net: { fontSize: 38, fontWeight: '800', letterSpacing: -1.3, color: colors.ink },
  netLabel: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },

  // stepper (replaces proto slider)
  stepperBox: { marginTop: 18 },
  stepperTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperTitle: { fontSize: 13, fontWeight: '600', color: colors.inkMid },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.lineSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: { backgroundColor: colors.line },
  stepBtnDisabled: { opacity: 0.35 },
  stepValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.teal,
    minWidth: 52,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepperBar: { marginTop: 12 },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  scaleText: { fontSize: 10, color: colors.faint, fontWeight: '600' },

  // breakdown rows (proto .lrow)
  breakdown: { marginTop: 6 },
  lrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  lb: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lbText: { fontSize: 13.5, fontWeight: '500', color: colors.inkMid },
  lv: { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },
  neg: { color: colors.bad },
  lrowTot: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 6,
    paddingTop: 13,
  },
  lbTotText: { fontSize: 15, fontWeight: '800', color: colors.ink },
  lvTot: { fontSize: 19, fontWeight: '800', color: colors.teal },

  // employer match note (proto .matchnote)
  matchNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.mintBg,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: 14,
  },
  matchText: { flex: 1, fontSize: 12, color: colors.green, fontWeight: '600' },
  matchBold: { fontWeight: '800', color: colors.green, fontSize: 12 },

  // income grid (proto .incgrid / .inc)
  incGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  incPress: { width: '48%' },
  incCard: { paddingVertical: 14, paddingHorizontal: 15 },
  incLabel: { fontSize: 11, color: colors.greige, fontWeight: '600' },
  incValue: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 6,
    color: colors.ink,
  },
  incCaption: { fontSize: 10.5, color: colors.faint, fontWeight: '500', marginTop: 3 },
  pressedDim: { opacity: 0.7 },

  // centered edit modal
  modalWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.scrim,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radius.hero,
    padding: 18,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  modalLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.greige,
    marginTop: 16,
    marginBottom: 8,
  },
  amtWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 15,
    marginTop: 2,
  },
  amtSymbol: { fontSize: 22, fontWeight: '700', color: colors.ink },
  amtInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  saveBtn: {
    marginTop: 18,
    height: 52,
    borderRadius: 15,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: colors.card, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
});
