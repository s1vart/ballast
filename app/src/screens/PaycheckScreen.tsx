import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { colors, radius, money } from '../theme';
import { Card, Money, SectionHead, HBar, Swatch } from '../components/ui';
import { BottomSheet, Field, PrimaryButton, Chip, DangerButton } from '../components/sheets';
import { useFeedback } from '../components/Feedback';
import { useData } from '../data/DataContext';
import { Filing, FILING_LABEL, TAX_YEAR } from '../logic/tax';
import { stateByCode, stateRateLabel } from '../logic/stateTax';
import { StatePicker } from '../components/StatePicker';
import type { Profile } from '../db';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FILINGS: Filing[] = ['single', 'mfj', 'mfs', 'hoh'];
const FILING_SHORT: Record<Filing, string> = {
  single: 'Single',
  mfj: 'MFJ',
  mfs: 'MFS',
  hoh: 'HoH',
};

const monthName = (m: number) => MONTHS_LONG[Math.min(Math.max(m, 1), 12) - 1];
/** Format a Date like "Sep 15". */
const shortDate = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
/** Parse a numeric string field; returns fallback when blank/invalid. */
const num = (s: string, fallback = 0) => {
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (cleaned.length === 0) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

export function PaycheckScreen() {
  const { profile, tax, monthlyNetIncome, today, updateProfile, restartOnboarding } = useData();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);

  if (!profile || !tax) {
    return (
      <View style={styles.emptyRoot}>
        <Text style={styles.emptyText}>Finish setup to see your income & taxes.</Text>
      </View>
    );
  }

  const rate = Math.round(tax.estimate.effectiveRate * 100);
  const barPct = tax.targetToDate > 0 ? (tax.setAside / tax.targetToDate) * 100 : 0;
  const onTrack = tax.gap >= 0;

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ---------- Income ---------- */}
        <SectionHead title="Income" />

        <Card style={styles.heroCard}>
          <Text style={styles.cardLabel}>Monthly take-home</Text>
          <Money style={styles.hero}>{money(monthlyNetIncome)}</Money>
          <Text style={styles.caption}>after estimated taxes</Text>
        </Card>

        {profile.hasW2 ? (
          <Card style={styles.rowCard}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle}>W2 salary</Text>
              <Money style={styles.rowAmt}>{money(profile.w2MonthlyGross)}/mo</Money>
            </View>
            <Text style={styles.caption}>
              since {monthName(profile.w2StartMonth)} · {money(tax.w2AnnualGross)} this year
            </Text>
          </Card>
        ) : null}

        {profile.has1099 ? (
          <Card style={styles.rowCard}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle}>1099 income</Text>
              <Money style={styles.rowAmt}>{money(profile.income1099MonthlyOngoing)}/mo</Money>
            </View>
            <Text style={styles.caption}>
              {money(profile.income1099YTD)} so far · {money(tax.annual1099Net)} projected
            </Text>
          </Card>
        ) : null}

        {/* ---------- Taxes ---------- */}
        <SectionHead title={`Taxes · ${TAX_YEAR}`} action="Adjust" onAction={() => setEditing(true)} />

        <Card style={styles.heroCard}>
          <Text style={styles.cardLabel}>Set aside for 1099 taxes</Text>
          <Money style={styles.hero}>{money(tax.annualTax)}</Money>
          <Text style={styles.caption}>
            {tax.overridden ? 'manual override' : `${rate}% of 1099 income — estimate`}
          </Text>

          {!tax.overridden ? (
            <View style={styles.breakdown}>
              <BreakRow color={colors.bad} label="Self-employment tax" value={tax.estimate.seTax} />
              <BreakRow color={colors.indigo} label="Federal income tax" value={tax.estimate.federalOn1099} />
              <BreakRow color={colors.blue} label="State" value={tax.estimate.stateOn1099} />
            </View>
          ) : null}

          {/* progress toward the prorated target */}
          <View style={styles.progressBox}>
            <AnimatedBar pct={barPct} color={onTrack ? colors.good : colors.bad} />
            <View style={styles.progressLabels}>
              <Money style={styles.progressLeft}>{money(tax.setAside)} set aside</Money>
              <Money style={styles.progressRight}>{money(tax.targetToDate)} due by now</Money>
            </View>
            <Text style={[styles.status, { color: onTrack ? colors.good : colors.bad }]}>
              {onTrack ? `On track (+${money(tax.gap)})` : `Behind by ${money(-tax.gap)}`}
            </Text>
          </View>

          {/* cadence */}
          <View style={styles.cadenceBox}>
            <Text style={styles.cadence}>
              {profile.payCadence === 'quarterly' && tax.nextQuarterly
                ? `Next estimated payment · ${tax.nextQuarterly.label} · ${shortDate(tax.nextQuarterly.due)}`
                : `Paying at filing — reserve grows toward ${money(tax.annualTax)}`}
            </Text>
          </View>
        </Card>

        <Text style={styles.disclaimer}>Estimates for tax year {TAX_YEAR}. Not tax advice.</Text>
      </ScrollView>

      <AdjustSheet
        visible={editing}
        profile={profile}
        onClose={() => setEditing(false)}
        onSave={async (patch) => {
          await updateProfile(patch);
          setEditing(false);
          toast('Updated');
        }}
        onStartOver={async () => {
          const ok = await confirm({
            title: 'Start over?',
            message: 'You\'ll go back through setup. Finishing it replaces your current data (accounts, envelopes, bills, goals).',
            confirmLabel: 'Start over',
            destructive: true,
          });
          if (ok) {
            setEditing(false);
            await restartOnboarding();
          }
        }}
      />
    </>
  );
}

/** Swatch + label + right-aligned money, used in the tax breakdown. */
function BreakRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.breakRow}>
      <View style={styles.breakLeft}>
        <Swatch color={color} />
        <Text style={styles.breakLabel}>{label}</Text>
      </View>
      <Money style={styles.breakValue}>{money(value)}</Money>
    </View>
  );
}

/** HBar that animates its fill on mount / when pct changes. Bar caps at 100%. */
function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const capped = Math.min(Math.max(pct, 0), 100);
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(value));
    Animated.timing(anim, {
      toValue: capped,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [capped, anim]);

  return <HBar pct={display} color={color} track={colors.line} height={10} />;
}

// ---------- Adjust sheet ----------

interface Draft {
  filing: Filing;
  stateCode: string;
  stateRatePct: number;
  w2Monthly: string;
  w2StartMonth: number;
  ytd: string;
  ongoing: string;
  setAside: string;
  cadence: Profile['payCadence'];
  override: string;
}

function fromProfile(p: Profile): Draft {
  return {
    filing: p.filingStatus,
    stateCode: p.state,
    stateRatePct: p.stateRatePct,
    w2Monthly: String(p.w2MonthlyGross),
    w2StartMonth: p.w2StartMonth,
    ytd: String(p.income1099YTD),
    ongoing: String(p.income1099MonthlyOngoing),
    setAside: String(p.taxSetAside),
    cadence: p.payCadence,
    override: p.taxOverride != null ? String(p.taxOverride) : '',
  };
}

function AdjustSheet({
  visible, profile, onClose, onSave, onStartOver,
}: {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (patch: Partial<Profile>) => void;
  onStartOver: () => void;
}) {
  const [d, setD] = useState<Draft>(() => fromProfile(profile));
  const [pickingState, setPickingState] = useState(false);

  // Re-seed the draft each time the sheet opens so edits start from live values.
  useEffect(() => {
    if (visible) setD(fromProfile(profile));
  }, [visible, profile]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const monthChips = useMemo(() => MONTHS_SHORT.map((m, i) => ({ label: m, month: i + 1 })), []);

  const save = () => {
    const overrideTrimmed = d.override.replace(/[^0-9.]/g, '');
    const patch: Partial<Profile> = {
      filingStatus: d.filing,
      state: d.stateCode,
      stateRatePct: d.stateRatePct,
      payCadence: d.cadence,
      taxSetAside: num(d.setAside, 0),
      taxOverride: overrideTrimmed.length > 0 ? num(d.override, 0) : null,
    };
    if (profile.hasW2) {
      patch.w2MonthlyGross = num(d.w2Monthly, profile.w2MonthlyGross);
      patch.w2StartMonth = d.w2StartMonth;
    }
    if (profile.has1099) {
      patch.income1099YTD = num(d.ytd, 0);
      patch.income1099MonthlyOngoing = num(d.ongoing, 0);
    }
    onSave(patch);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Adjust income & taxes">
      <Text style={styles.sheetLabel}>Filing status</Text>
      <View style={styles.chipRow}>
        {FILINGS.map((f) => (
          <Chip key={f} label={FILING_SHORT[f]} selected={d.filing === f} onPress={() => set('filing', f)} />
        ))}
      </View>
      <Text style={styles.chipHint}>{FILING_LABEL[d.filing]}</Text>

      <Text style={styles.sheetLabel}>State</Text>
      <Pressable
        style={({ pressed }) => [styles.stateBtn, pressed && styles.pressedDim]}
        onPress={() => setPickingState(true)}
      >
        {stateByCode(d.stateCode) ? (
          <>
            <Text style={styles.stateName}>{stateByCode(d.stateCode)!.name}</Text>
            <Text style={styles.stateRateTx}>{stateRateLabel(stateByCode(d.stateCode)!)}</Text>
          </>
        ) : (
          <Text style={styles.statePlaceholder}>Select your state…</Text>
        )}
      </Pressable>
      <StatePicker
        visible={pickingState}
        onClose={() => setPickingState(false)}
        onSelect={(s) => { set('stateCode', s.code); set('stateRatePct', s.rate); }}
        selectedCode={d.stateCode}
      />

      {profile.hasW2 ? (
        <>
          <Field
            label="W2 monthly gross"
            value={d.w2Monthly}
            onChangeText={(t) => set('w2Monthly', t)}
            keyboardType="decimal-pad"
            money
            placeholder="0"
          />
          <Text style={styles.sheetLabel}>W2 start month</Text>
          <View style={styles.chipRow}>
            {monthChips.map((m) => (
              <Chip
                key={m.month}
                label={m.label}
                selected={d.w2StartMonth === m.month}
                onPress={() => set('w2StartMonth', m.month)}
              />
            ))}
          </View>
        </>
      ) : null}

      {profile.has1099 ? (
        <>
          <Field
            label="1099 income year-to-date"
            value={d.ytd}
            onChangeText={(t) => set('ytd', t)}
            keyboardType="decimal-pad"
            money
            placeholder="0"
          />
          <Field
            label="1099 ongoing (per month)"
            value={d.ongoing}
            onChangeText={(t) => set('ongoing', t)}
            keyboardType="decimal-pad"
            money
            placeholder="0"
          />
        </>
      ) : null}

      <Field
        label="Amount set aside for taxes"
        value={d.setAside}
        onChangeText={(t) => set('setAside', t)}
        keyboardType="decimal-pad"
        money
        placeholder="0"
      />

      <Text style={styles.sheetLabel}>Payment cadence</Text>
      <View style={styles.chipRow}>
        <Chip label="Quarterly" selected={d.cadence === 'quarterly'} onPress={() => set('cadence', 'quarterly')} />
        <Chip label="At filing" selected={d.cadence === 'at_filing'} onPress={() => set('cadence', 'at_filing')} />
      </View>

      <Field
        label="Tax override (optional)"
        value={d.override}
        onChangeText={(t) => set('override', t)}
        keyboardType="decimal-pad"
        money
        placeholder="Use estimate"
      />
      <Text style={styles.chipHint}>Leave blank to use the automatic estimate.</Text>

      <PrimaryButton label="Save" onPress={save} />
      <DangerButton label="Start over (redo setup)" onPress={onStartOver} />
    </BottomSheet>
  );
}

// ---------- styles ----------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  emptyRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.ground },
  emptyText: { fontSize: 15, color: colors.inkSoft, fontWeight: '600', textAlign: 'center' },

  cardLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.greige,
  },
  caption: { fontSize: 12, color: colors.inkSoft, fontWeight: '500', marginTop: 4 },

  heroCard: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 18 },
  hero: { fontSize: 38, fontWeight: '800', letterSpacing: -1.3, color: colors.ink, marginTop: 8 },

  rowCard: { paddingHorizontal: 17, paddingVertical: 14, marginTop: 11 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  rowAmt: { fontSize: 16, fontWeight: '800', color: colors.teal, letterSpacing: -0.3 },

  // tax breakdown rows
  breakdown: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 },
  breakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  breakLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  breakLabel: { fontSize: 13.5, fontWeight: '500', color: colors.inkMid },
  breakValue: { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },

  // progress
  progressBox: { marginTop: 16 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  progressLeft: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  progressRight: { fontSize: 12.5, fontWeight: '600', color: colors.inkSoft },
  status: { fontSize: 13, fontWeight: '800', marginTop: 8, letterSpacing: -0.2 },

  cadenceBox: {
    marginTop: 16, backgroundColor: colors.mintBg, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13,
  },
  cadence: { fontSize: 12.5, fontWeight: '600', color: colors.green },

  disclaimer: { fontSize: 11, color: colors.faint, fontWeight: '500', marginTop: 14, marginHorizontal: 2 },

  // sheet
  pressedDim: { opacity: 0.7 },
  stateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#E4E7EB', borderRadius: 14,
    paddingHorizontal: 15, paddingVertical: 14, marginTop: 8,
  },
  stateName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  stateRateTx: { fontSize: 12.5, fontWeight: '600', color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  statePlaceholder: { fontSize: 15, fontWeight: '600', color: colors.faint },
  sheetLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase',
    color: colors.greige, marginTop: 16, marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipHint: { fontSize: 12, color: colors.inkSoft, fontWeight: '500', marginTop: 8 },
});
