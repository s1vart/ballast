import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Animated, Easing, ViewStyle,
} from 'react-native';
import { colors, radius, money, ymd } from '../theme';
import { Card, Money, HBar } from '../components/ui';
import { Field, PrimaryButton, Chip } from '../components/sheets';
import { useFeedback } from '../components/Feedback';
import { Screen } from '../components/Screen';
import { useData } from '../data/DataContext';
import { Filing, FILING_LABEL, TAX_YEAR } from '../logic/tax';
import { summarizeProfile } from '../logic/profile';
import { StateInfo, stateRateLabel } from '../logic/stateTax';
import { StatePicker } from '../components/StatePicker';
import type { Profile } from '../db';

const FILINGS: Filing[] = ['single', 'mfj', 'mfs', 'hoh'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEP_COUNT = 7;

// Parse a possibly-messy numeric text field into a safe number (>= 0 by default).
const num = (t: string): number => {
  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
// Does the text hold a valid, parseable number (used for gate that requires "a number")?
const isNum = (t: string): boolean => {
  const cleaned = t.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return false;
  return Number.isFinite(parseFloat(cleaned));
};

interface AcctRow { key: string; name: string; balance: string }

export function Onboarding() {
  const { completeOnboarding, today } = useData();
  const { toast } = useFeedback();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ---- answers ----
  const [filing, setFiling] = useState<Filing | null>(null);
  const [pickedState, setPickedState] = useState<StateInfo | null>(null);
  const [pickingState, setPickingState] = useState(false);

  const [hasW2, setHasW2] = useState<boolean | null>(null);
  const [w2Gross, setW2Gross] = useState('');
  const [w2Month, setW2Month] = useState<number | null>(null);

  const [has1099, setHas1099] = useState<boolean | null>(null);
  const [ytd1099, setYtd1099] = useState('');
  const [ongoing1099, setOngoing1099] = useState('');

  const [setAside, setSetAside] = useState('');
  const [cadence, setCadence] = useState<Profile['payCadence'] | null>(null);

  const [accts, setAccts] = useState<AcctRow[]>([{ key: 'a0', name: '', balance: '' }]);
  const acctSeq = useRef(1);

  // ---- assembled profile (uses safe parsing + skipped sub-fields) ----
  const profile: Profile = useMemo(() => ({
    filingStatus: filing ?? 'single',
    state: pickedState?.code ?? 'none',
    stateRatePct: pickedState?.rate ?? 0,
    hasW2: hasW2 === true,
    w2MonthlyGross: hasW2 === true ? num(w2Gross) : 0,
    w2StartMonth: hasW2 === true ? (w2Month ?? 1) : 1,
    has1099: has1099 === true,
    income1099YTD: has1099 === true ? num(ytd1099) : 0,
    income1099MonthlyOngoing: has1099 === true ? num(ongoing1099) : 0,
    taxSetAside: num(setAside),
    payCadence: cadence ?? 'quarterly',
    taxOverride: null,
  }), [filing, pickedState, hasW2, w2Gross, w2Month, has1099, ytd1099, ongoing1099, setAside, cadence]);

  // ---- per-step Next gate ----
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return filing != null && pickedState != null;
      case 2:
        if (hasW2 == null) return false;
        if (hasW2) return num(w2Gross) > 0 && w2Month != null;
        return true;
      case 3:
        if (has1099 == null) return false;
        if (has1099) return isNum(ytd1099) && num(ytd1099) >= 0 && isNum(ongoing1099) && num(ongoing1099) >= 0;
        return true;
      case 4:
        return isNum(setAside) && num(setAside) >= 0 && cadence != null;
      case 5:
        return true; // accounts optional
      case 6:
        return true;
      default:
        return false;
    }
  }, [step, filing, pickedState, hasW2, w2Gross, w2Month, has1099, ytd1099, ongoing1099, setAside, cadence]);

  // ---- slide animation ----
  const dir = useRef(1); // 1 = forward, -1 = back
  const anim = useRef(new Animated.Value(1)).current; // 0 = off-screen, 1 = settled

  const go = (next: number) => {
    if (next === step) return;
    dir.current = next > step ? 1 : -1;
    // animate current out, swap content, animate in
    Animated.timing(anim, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setStep(next);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const onNext = () => {
    if (!canAdvance || submitting) return;
    if (step === STEP_COUNT - 1) {
      finish();
      return;
    }
    go(step + 1);
  };
  const onBack = () => {
    if (submitting) return;
    if (step === 0) return;
    go(step - 1);
  };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    const starting = accts
      .filter((a) => a.name.trim().length > 0)
      .map((a) => ({ name: a.name.trim(), balance: num(a.balance) }));
    try {
      await completeOnboarding(profile, starting);
      // On success the app flips away from this screen; toast is a graceful touch.
      toast('Welcome to Ballast');
    } catch (e) {
      setSubmitting(false);
      toast('Something went wrong — please try again');
    }
  };

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [24 * dir.current, 0],
  });

  const addAccount = () => {
    const key = `a${acctSeq.current++}`;
    setAccts((prev) => [...prev, { key, name: '', balance: '' }]);
  };
  const patchAccount = (key: string, patch: Partial<AcctRow>) => {
    setAccts((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  };
  const removeAccount = (key: string) => {
    setAccts((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.key !== key)));
  };

  const isFirst = step === 0;
  const isLast = step === STEP_COUNT - 1;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* progress bar */}
        <View style={styles.progressRow}>
          {isFirst ? (
            <View style={styles.backSpacer} />
          ) : (
            <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => [styles.backBtn, pressed && styles.pressedSoft]}>
              <Text style={styles.backTx}>‹ Back</Text>
            </Pressable>
          )}
          <View style={styles.dots}>
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && styles.dotActive,
                  i < step && styles.dotDone,
                ]}
              />
            ))}
          </View>
          <View style={styles.backSpacer} />
        </View>

        {/* animated step body */}
        <Animated.View style={[styles.stepFill, { opacity: anim, transform: [{ translateX }] }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 0 && <StepWelcome />}

            {step === 1 && (
              <StepBody
                title="Filing & state"
                subtitle="This sets your federal brackets and your state's tax rate."
              >
                <Text style={styles.qLabel}>Filing status</Text>
                <View style={styles.chipWrap}>
                  {FILINGS.map((f) => (
                    <Chip key={f} label={FILING_LABEL[f]} selected={filing === f} onPress={() => setFiling(f)} />
                  ))}
                </View>
                <Text style={styles.qLabel}>State</Text>
                <Pressable
                  style={({ pressed }) => [styles.stateBtn, pressed && styles.pressedSoft]}
                  onPress={() => setPickingState(true)}
                >
                  {pickedState ? (
                    <>
                      <Text style={styles.stateName}>{pickedState.name}</Text>
                      <Text style={[styles.stateRate, pickedState.kind === 'none' && styles.stateRateNone]}>
                        {stateRateLabel(pickedState)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.statePlaceholder}>Select your state…</Text>
                  )}
                </Pressable>
                <Text style={styles.helper}>
                  {pickedState && pickedState.kind === 'graduated'
                    ? 'Graduated-bracket state — we use an approximate rate you can fine-tune later.'
                    : 'We look up your state’s income tax rate automatically. Adjustable later.'}
                </Text>
                <StatePicker
                  visible={pickingState}
                  onClose={() => setPickingState(false)}
                  onSelect={setPickedState}
                  selectedCode={pickedState?.code}
                />
              </StepBody>
            )}

            {step === 2 && (
              <StepBody
                title="W2 income"
                subtitle="Salaried pay where taxes are withheld from each check."
              >
                <Text style={styles.qLabel}>Do you earn W2 salary (taxes withheld)?</Text>
                <View style={styles.chipWrap}>
                  <Chip label="Yes" selected={hasW2 === true} onPress={() => setHasW2(true)} />
                  <Chip label="No" selected={hasW2 === false} onPress={() => setHasW2(false)} />
                </View>
                {hasW2 === true && (
                  <>
                    <Field
                      label="Gross monthly pay (before tax)"
                      value={w2Gross}
                      onChangeText={setW2Gross}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      money
                    />
                    <Text style={styles.qLabel}>What month did that start this year?</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.monthRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      {MONTHS.map((m, i) => (
                        <Chip key={m} label={m} selected={w2Month === i + 1} onPress={() => setW2Month(i + 1)} />
                      ))}
                    </ScrollView>
                  </>
                )}
              </StepBody>
            )}

            {step === 3 && (
              <StepBody
                title="1099 income"
                subtitle="Self-employed or contract pay with no tax withheld."
              >
                <Text style={styles.qLabel}>Any 1099 / self-employed income (no tax withheld)?</Text>
                <View style={styles.chipWrap}>
                  <Chip label="Yes" selected={has1099 === true} onPress={() => setHas1099(true)} />
                  <Chip label="No" selected={has1099 === false} onPress={() => setHas1099(false)} />
                </View>
                {has1099 === true && (
                  <>
                    <Field
                      label="1099 income so far this year"
                      value={ytd1099}
                      onChangeText={setYtd1099}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      money
                    />
                    <Field
                      label="Ongoing 1099 per month (0 if one-off)"
                      value={ongoing1099}
                      onChangeText={setOngoing1099}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      money
                    />
                  </>
                )}
              </StepBody>
            )}

            {step === 4 && (
              <StepBody
                title="Taxes"
                subtitle="We track your set-aside against what you'll owe on 1099 income."
              >
                <Field
                  label="How much have you set aside for taxes so far?"
                  value={setAside}
                  onChangeText={setSetAside}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  money
                />
                <Text style={styles.qLabel}>How will you pay?</Text>
                <View style={styles.chipWrap}>
                  <Chip label="Quarterly" selected={cadence === 'quarterly'} onPress={() => setCadence('quarterly')} />
                  <Chip label="At filing" selected={cadence === 'at_filing'} onPress={() => setCadence('at_filing')} />
                </View>
              </StepBody>
            )}

            {step === 5 && (
              <StepBody
                title="Starting accounts"
                subtitle="Add cash accounts to see your real balance. Optional — you can skip this."
              >
                <View style={styles.acctList}>
                  {accts.map((a, idx) => (
                    <View key={a.key} style={styles.acctRow}>
                      <View style={styles.acctFields}>
                        <Field
                          label={`Account ${idx + 1} name`}
                          value={a.name}
                          onChangeText={(t) => patchAccount(a.key, { name: t })}
                          placeholder="e.g. Checking"
                        />
                        <Field
                          label="Balance"
                          value={a.balance}
                          onChangeText={(t) => patchAccount(a.key, { balance: t })}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          money
                        />
                      </View>
                      {accts.length > 1 && (
                        <Pressable
                          onPress={() => removeAccount(a.key)}
                          hitSlop={8}
                          style={({ pressed }) => [styles.removeBtn, pressed && styles.pressedSoft]}
                        >
                          <Text style={styles.removeTx}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
                <Pressable
                  onPress={addAccount}
                  style={({ pressed }) => [styles.addBtn, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.addTx}>+ Add another</Text>
                </Pressable>
              </StepBody>
            )}

            {step === 6 && <StepReview profile={profile} today={today} />}
          </ScrollView>
        </Animated.View>

        {/* footer CTA */}
        <View style={styles.footer}>
          {isFirst ? (
            <PrimaryButton label="Get started" onPress={onNext} />
          ) : (
            <PrimaryButton
              label={isLast ? (submitting ? 'Setting up…' : 'Finish setup') : 'Next'}
              onPress={onNext}
              disabled={!canAdvance || submitting}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

// ---------- step scaffolding ----------

function StepBody({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.stepTitle}>{title}</Text>
      {subtitle ? <Text style={styles.stepSub}>{subtitle}</Text> : null}
      <View style={styles.stepInner}>{children}</View>
    </View>
  );
}

function StepWelcome() {
  return (
    <View style={styles.welcome}>
      <View style={styles.mark}>
        <Text style={styles.markTx}>⚓</Text>
      </View>
      <Text style={styles.welcomeH}>Let's set up Ballast</Text>
      <Text style={styles.welcomeP}>
        Everything you enter is private and stored only on this phone — no accounts, no cloud.
      </Text>
      <Text style={styles.welcomeP}>
        Ballast uses today's date to estimate your {TAX_YEAR} taxes, so your numbers stay current as the year goes on.
      </Text>
    </View>
  );
}

// ---------- review ----------

function StepReview({ profile, today }: { profile: Profile; today: Date }) {
  const s = useMemo(() => summarizeProfile(profile, today), [profile, today]);
  const onTrack = s.gap >= 0;
  const effPct = Math.round(s.effectiveRate * 100);

  // progress of set-aside vs. what's due by now (guard divide-by-zero)
  const targetPct = s.targetToDate > 0 ? (s.setAside / s.targetToDate) * 100 : 100;

  return (
    <View>
      <Text style={styles.stepTitle}>Review</Text>
      <Text style={styles.stepSub}>Here's your starting picture — everything is adjustable later.</Text>

      <Card style={styles.reviewCard}>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Monthly take-home</Text>
          <Money style={styles.reviewBig}>{money(s.monthlyNetIncome)}</Money>
        </View>

        {profile.has1099 && s.annual1099Net > 0 ? (
          <>
            <View style={styles.divider} />
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Set aside for 1099 taxes this year</Text>
              <Money style={styles.reviewVal}>{money(s.annualTax)}</Money>
            </View>
            <Text style={styles.reviewSub}>{effPct}% of 1099 income</Text>

            <View style={styles.divider} />
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Set aside vs. due by now</Text>
              <Money style={styles.reviewVal}>
                {money(s.setAside)} / {money(s.targetToDate)}
              </Money>
            </View>
            <View style={styles.barWrap}>
              <HBar pct={targetPct} color={onTrack ? colors.good : colors.warn} track={colors.line} />
            </View>
            <View style={[styles.statusPill, { backgroundColor: onTrack ? colors.greenBg : colors.badBg }]}>
              <Text style={[styles.statusTx, { color: onTrack ? colors.good : colors.bad }]}>
                {onTrack ? 'On track' : `Behind by ${money(Math.abs(s.gap))}`}
              </Text>
            </View>

            {profile.payCadence === 'quarterly' && s.nextQuarterly ? (
              <>
                <View style={styles.divider} />
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Next estimated payment</Text>
                  <Text style={styles.reviewVal}>
                    {s.nextQuarterly.label} · {ymd(s.nextQuarterly.due)}
                  </Text>
                </View>
              </>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <Text style={styles.reviewSub}>
              No 1099 income entered — no self-employment tax set-aside needed.
            </Text>
          </>
        )}
      </Card>

      <Text style={styles.disclaimer}>
        Estimates for tax year {TAX_YEAR} — not tax advice. Adjust anything later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },

  // progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 40,
  },
  backBtn: { width: 64, paddingVertical: 4 },
  backSpacer: { width: 64 },
  backTx: { fontSize: 15, fontWeight: '700', color: colors.teal },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: colors.line },
  dotDone: { backgroundColor: colors.tealBright },
  dotActive: { width: 20, backgroundColor: colors.teal },

  // body
  stepFill: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 12, paddingBottom: 20 },
  stepTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.ink },
  stepSub: { fontSize: 14.5, color: colors.inkSoft, lineHeight: 20, marginTop: 8 },
  stepInner: { marginTop: 6 },

  qLabel: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 20, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  helper: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, marginTop: 10 },
  stateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#E4E7EB', borderRadius: 14,
    paddingHorizontal: 15, paddingVertical: 15,
  },
  stateName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  stateRate: { fontSize: 12.5, fontWeight: '600', color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  stateRateNone: { color: colors.good },
  statePlaceholder: { fontSize: 16, fontWeight: '600', color: colors.faint },

  // welcome
  welcome: { paddingTop: 40, alignItems: 'flex-start' },
  mark: {
    width: 68, height: 68, borderRadius: 20, backgroundColor: colors.mintBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 26,
  },
  markTx: { fontSize: 34 },
  welcomeH: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: colors.ink, marginBottom: 16 },
  welcomeP: { fontSize: 15.5, color: colors.inkMid, lineHeight: 23, marginBottom: 14 },

  // accounts
  acctList: { gap: 6 },
  acctRow: { marginTop: 6 },
  acctFields: { flexDirection: 'row', gap: 12 },
  removeBtn: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  removeTx: { fontSize: 12.5, fontWeight: '700', color: colors.bad },
  addBtn: {
    marginTop: 18, alignSelf: 'flex-start', borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.teal, paddingHorizontal: 16, paddingVertical: 10,
  },
  addTx: { fontSize: 13.5, fontWeight: '700', color: colors.teal },

  // review
  reviewCard: { marginTop: 18, padding: 18 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  reviewLabel: { fontSize: 14, color: colors.inkMid, flex: 1 },
  reviewVal: { fontSize: 15, fontWeight: '700', color: colors.ink },
  reviewBig: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: colors.teal },
  reviewSub: { fontSize: 12.5, color: colors.inkSoft, marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  barWrap: { marginTop: 12 },
  statusPill: {
    alignSelf: 'flex-start', marginTop: 12, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  statusTx: { fontSize: 12.5, fontWeight: '800' },
  disclaimer: { fontSize: 12, color: colors.faint, lineHeight: 17, marginTop: 16, marginBottom: 4 },

  // footer
  footer: { paddingTop: 4, paddingBottom: 6 },

  pressedSoft: { opacity: 0.6 },
});
