import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, money, radius } from '../theme';
import { Card, Money, SectionHead } from '../components/ui';
import { RecurringManager } from '../components/RecurringManager';
import { useData } from '../data/DataContext';
import type { Recurring } from '../logic/finance';
import { Account, isCash, displayName } from '../types';

// ---------- inline icons (ported from the prototype SVGs) ----------

function AnchorIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Circle cx={12} cy={5} r={2.4} fill="none" stroke={colors.card} strokeWidth={1.8} />
      <Path d="M12 7.4V20" fill="none" stroke={colors.card} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M7.5 9.5h9" fill="none" stroke={colors.card} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4.5 13a7.5 7.5 0 0 0 15 0" fill="none" stroke={colors.card} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function DeltaArrow({ up }: { up: boolean }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 10 10">
      <Path
        d={up ? 'M5 1.5v7M5 1.5L2 4.5M5 1.5l3 3' : 'M5 8.5v-7M5 8.5L2 5.5M5 8.5l3-3'}
        fill="none"
        stroke={up ? colors.good : colors.bad}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckingIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Rect x={1.5} y={3} width={11} height={8} rx={1.5} fill="none" stroke={color} strokeWidth={1.4} />
      <Path d="M1.5 5.5h11" fill="none" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

function SavingsIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path
        d="M7 1.5l5 2.3v3.4c0 3-2.1 4.8-5 5.3-2.9-.5-5-2.3-5-5.3V3.8L7 1.5z"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path d="M4.8 7l1.6 1.6L9.4 5.5" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------- small pieces ----------

function AccountChip({ account }: { account: Account }) {
  const kind = `${account.subtype ?? account.type ?? ''} ${account.name}`.toLowerCase();
  const isSavings = kind.includes('sav');
  const bg = isSavings ? colors.greenBg : colors.blueBg;
  const tint = isSavings ? colors.green : colors.blue;
  const raw = account.subtype ?? account.type ?? 'Account';
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <Card style={styles.chip}>
      <View style={styles.chipRow}>
        <View style={[styles.chipIc, { backgroundColor: bg }]}>
          {isSavings ? <SavingsIcon color={tint} /> : <CheckingIcon color={tint} />}
        </View>
        <Text style={styles.chipName} numberOfLines={1}>
          {displayName(account)}
        </Text>
      </View>
      <Money style={styles.chipAmt}>{money(account.balance)}</Money>
      <Text style={styles.chipTy}>{label}</Text>
    </Card>
  );
}

function BillRow({ bill, monthLabel, last }: { bill: Recurring; monthLabel: string; last: boolean }) {
  return (
    <View style={[styles.bill, last && styles.billLast]}>
      <View style={styles.billDt}>
        <Text style={styles.billDd}>{bill.dayOfMonth}</Text>
        <Text style={styles.billDm}>{monthLabel}</Text>
      </View>
      <View style={styles.billDivider} />
      <View style={styles.billMid}>
        <Text style={styles.billName} numberOfLines={1}>
          {bill.name}
        </Text>
        <Text style={styles.billCat} numberOfLines={1}>
          {bill.category}
        </Text>
      </View>
      <Money style={styles.billAmt}>{money(bill.amount)}</Money>
    </View>
  );
}

// ---------- screen ----------

export function HomeScreen() {
  const { accounts, recurring, projection, checkingBalance, trajectory, today } = useData();
  const cashAccounts = accounts.filter(isCash);
  const [showAll, setShowAll] = useState(false);

  const monthYear = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const monShort = today.toLocaleString('en-US', { month: 'short' });
  const nextMonShort = new Date(today.getFullYear(), today.getMonth() + 1, 1).toLocaleString('en-US', { month: 'short' });
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const todayDate = today.getDate();

  const delta = projection - checkingBalance;
  const up = delta >= 0;
  const deltaBg = up ? colors.mintBg : colors.badBg;
  const deltaColor = up ? colors.good : colors.bad;

  const sortedBills = useMemo(() => [...recurring].sort((a, b) => a.dayOfMonth - b.dayOfMonth), [recurring]);

  const nextBills = useMemo(() => {
    const later = sortedBills.filter((b) => b.dayOfMonth >= todayDate);
    const wrapped = sortedBills.filter((b) => b.dayOfMonth < todayDate);
    return [...later, ...wrapped].slice(0, 4);
  }, [sortedBills, todayDate]);


  // Chart geometry: days map across x 6..306, balances scale into y with 12px pad.
  const chart = useMemo(() => {
    if (trajectory.length < 2) return null;
    const H = 128;
    const X0 = 6;
    const X1 = 306;
    const PAD = 12;
    const balances = trajectory.map((p) => p.balance);
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const span = max - min;
    const n = trajectory.length;
    const x = (i: number) => X0 + (i / (n - 1)) * (X1 - X0);
    const y = (b: number) => (span <= 0 ? H / 2 : PAD + (1 - (b - min) / span) * (H - PAD * 2));
    const pts = trajectory.map((p, i) => ({ x: x(i), y: y(p.balance) }));
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (!first || !last) return null;
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${last.x.toFixed(1)} ${H} L${first.x.toFixed(1)} ${H} Z`;
    return { line, area, first, last };
  }, [trajectory]);

  const monthLabelFor = (b: Recurring) => (b.dayOfMonth < todayDate ? nextMonShort : monShort);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Brand header */}
      <View style={styles.apphead}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <AnchorIcon />
          </View>
          <View>
            <Text style={styles.bname}>Ballast</Text>
            <Text style={styles.bsub}>{monthYear} · Home</Text>
          </View>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarTx}>T</Text>
        </View>
      </View>

      {/* Hero projection card */}
      <Card style={styles.hero}>
        <View style={styles.eb}>
          <View style={styles.ebDot} />
          <Text style={styles.ebTx}>Projected end of month · Checking</Text>
        </View>
        <Money style={styles.big}>
          {money(projection)}
          <Text style={styles.cents}>.00</Text>
        </Money>
        <View style={styles.sub}>
          <View style={[styles.delta, { backgroundColor: deltaBg }]}>
            <DeltaArrow up={up} />
            <Money style={[styles.deltaTx, { color: deltaColor }]}>{money(delta, { sign: true })}</Money>
          </View>
          <Text style={styles.cap}>vs. today's {money(checkingBalance)}</Text>
        </View>

        <View style={styles.chartwrap}>
          <Svg width="100%" height={128} viewBox="0 0 322 128" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="homeTrajFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.teal} stopOpacity={0.16} />
                <Stop offset="1" stopColor={colors.teal} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} y1={30} x2={322} y2={30} stroke={colors.line} />
            <Line x1={0} y1={66} x2={322} y2={66} stroke={colors.line} />
            <Line x1={0} y1={102} x2={322} y2={102} stroke={colors.line} />
            {chart ? (
              <>
                <Path d={chart.area} fill="url(#homeTrajFill)" />
                <Path
                  d={chart.line}
                  fill="none"
                  stroke={colors.teal}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Line
                  x1={chart.last.x}
                  y1={chart.last.y}
                  x2={chart.last.x}
                  y2={128}
                  stroke={colors.teal}
                  strokeDasharray="2 3"
                  opacity={0.4}
                />
                <Circle cx={chart.first.x} cy={chart.first.y} r={3} fill={colors.card} stroke={colors.teal} strokeWidth={2} />
                <Circle cx={chart.last.x} cy={chart.last.y} r={10} fill={colors.teal} opacity={0.12} />
                <Circle cx={chart.last.x} cy={chart.last.y} r={5.5} fill={colors.teal} />
              </>
            ) : null}
          </Svg>
          <View style={styles.endlabel}>
            <Money style={styles.endlabelTx}>{money(projection)}</Money>
          </View>
        </View>
        <View style={styles.clegend}>
          <Text style={styles.clegendTx}>{monShort} 1</Text>
          <Text style={styles.clegendTx}>{monShort} 15</Text>
          <Text style={styles.clegendTx}>
            {monShort} {lastDay}
          </Text>
        </View>
      </Card>

      {/* Account chips — cash only (cards are debt, shown on the Accounts tab) */}
      {cashAccounts.length > 0 ? (
        <View style={styles.chips}>
          {cashAccounts.map((a) => (
            <AccountChip key={a.id} account={a} />
          ))}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No accounts yet</Text>
          <Text style={styles.emptySub}>Add your checking and savings balances on the Accounts tab to power this projection.</Text>
        </Card>
      )}

      {/* Upcoming bills */}
      <SectionHead title="Upcoming this month" action="See all" onAction={() => setShowAll(true)} />
      {nextBills.length > 0 ? (
        <Card>
          {nextBills.map((b, i) => (
            <BillRow key={b.id} bill={b} monthLabel={monthLabelFor(b)} last={i === nextBills.length - 1} />
          ))}
        </Card>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No recurring bills</Text>
          <Text style={styles.emptySub}>Bills you add will show up here as they come due.</Text>
        </Card>
      )}

      {/* Full add/edit/delete bills manager */}
      <RecurringManager visible={showAll} onClose={() => setShowAll(false)} />
    </ScrollView>
  );
}

// ---------- styles ----------

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  apphead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 6,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bname: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },
  bsub: { fontSize: 11, fontWeight: '500', color: colors.greige, marginTop: 2 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.mintBg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTx: { fontSize: 12.5, fontWeight: '700', color: colors.teal },

  hero: { marginTop: 2, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 10 },
  eb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ebDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal },
  ebTx: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.greige,
  },
  big: { fontSize: 45, fontWeight: '700', letterSpacing: -1.6, lineHeight: 46, marginTop: 8, color: colors.ink },
  cents: { fontSize: 25, fontWeight: '600', color: colors.inkMid, letterSpacing: -0.5 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingLeft: 7,
    paddingRight: 9,
    borderRadius: radius.pill,
  },
  deltaTx: { fontSize: 12.5, fontWeight: '700' },
  cap: { fontSize: 12.5, fontWeight: '500', color: colors.inkSoft },
  chartwrap: { marginTop: 12 },
  endlabel: {
    position: 'absolute',
    top: -2,
    right: 6,
    backgroundColor: colors.teal,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  endlabelTx: { color: colors.card, fontSize: 10.5, fontWeight: '700' },
  clegend: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 2 },
  clegendTx: { fontSize: 10.5, fontWeight: '600', color: colors.faint },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  chip: { flexGrow: 1, flexBasis: '40%', paddingVertical: 12, paddingHorizontal: 13 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipIc: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chipName: { fontSize: 12, fontWeight: '600', color: colors.inkMid, flexShrink: 1 },
  chipAmt: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, marginTop: 9, color: colors.ink },
  chipTy: { fontSize: 10.5, fontWeight: '500', color: colors.faint, marginTop: 2 },
  emptyCard: { marginTop: 12, paddingVertical: 16, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  emptySub: { fontSize: 11.5, fontWeight: '500', color: colors.greige, marginTop: 3 },

  bill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  billLast: { borderBottomWidth: 0 },
  billDt: { width: 38, alignItems: 'center' },
  billDd: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: colors.ink, fontVariant: ['tabular-nums'] },
  billDm: {
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  billDivider: { width: 1, height: 26, backgroundColor: colors.line },
  billMid: { flex: 1, minWidth: 0 },
  billName: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
  billCat: { fontSize: 11, fontWeight: '500', color: colors.faint, marginTop: 2 },
  billAmt: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },
});
