import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { colors, radius, money, guessCardColor } from '../theme';
import { Card, Money, SectionHead, Swatch } from '../components/ui';
import { useFeedback } from '../components/Feedback';
import { AccountEditor } from '../components/AccountEditor';
import { useData } from '../data/DataContext';
import { Account, isCash, isLiability, isInvestment, isRetirement, displayName } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// ---------- inline icons (ported from the prototype SVGs) ----------

function CardGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 14 14" fill="none">
      <Rect x={1.5} y={3} width={11} height={8} rx={1.5} stroke={color} strokeWidth={1.4} />
      <Path d="M1.5 5.5h11" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

function ShieldGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 14 14" fill="none">
      <Path
        d="M7 1.5l5 2.3v3.4c0 3-2.1 4.8-5 5.3-2.9-.5-5-2.3-5-5.3V3.8L7 1.5z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusSquareGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={4} stroke={color} strokeWidth={1.6} />
      <Path d="M12 8v8M8 12h8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function InvestGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M4 18l5-5 3 3 7-8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 8h4v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------- helpers ----------

type AcctKind = 'checking' | 'savings' | 'other';

function acctKind(a: Account): AcctKind {
  const hint = `${a.subtype ?? ''} ${a.type ?? ''} ${a.name}`.toLowerCase();
  if (hint.includes('checking')) return 'checking';
  if (hint.includes('saving')) return 'savings';
  return 'other';
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function AccountIcon({ kind }: { kind: AcctKind }) {
  if (kind === 'checking') {
    return (
      <View style={[styles.acctIcon, { backgroundColor: colors.blueBg }]}>
        <CardGlyph color={colors.blue} />
      </View>
    );
  }
  if (kind === 'savings') {
    return (
      <View style={[styles.acctIcon, { backgroundColor: colors.greenBg }]}>
        <ShieldGlyph color={colors.green} />
      </View>
    );
  }
  return (
    <View style={[styles.acctIcon, { backgroundColor: colors.lineSoft }]}>
      <CardGlyph color={colors.greige} />
    </View>
  );
}

// ---------- screen ----------

export function AccountsScreen() {
  const {
    accounts, categories, recurring, breakdown, savingsTransfer, totalCash, cardDebt, netWorth,
    checkingBalance, projection, today, syncBank, linkBank, pendingByAccount, investmentsTotal,
  } = useData();
  const { toast } = useFeedback();
  const [linking, setLinking] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const cashAccounts = useMemo(() => accounts.filter(isCash), [accounts]);
  const cardAccounts = useMemo(() => accounts.filter(isLiability), [accounts]);
  const investmentAccounts = useMemo(() => accounts.filter(isInvestment), [accounts]);

  const [syncing, setSyncing] = useState(false);

  const bills = useMemo(() => recurring.reduce((s, b) => s + b.amount, 0), [recurring]);
  const variableBudget = useMemo(() => categories.reduce((s, c) => s + c.monthlyLimit, 0), [categories]);

  const monthName = MONTHS[today.getMonth()] ?? '';
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncBank();
    } catch {
      // Server may be offline — silently stop.
    } finally {
      setSyncing(false);
    }
  }, [syncing, syncBank]);


  const handleLink = useCallback(async () => {
    if (linking) return;
    setLinking(true);
    try {
      const { institution, count } = await linkBank();
      toast(`Linked ${institution ?? 'your bank'} — ${count} account${count === 1 ? '' : 's'} synced`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg !== 'cancelled') toast('Could not connect — is the server running?');
    } finally {
      setLinking(false);
    }
  }, [linking, linkBank, toast]);


  const ledger: Array<{ key: string; label: string; swatch: string; value: string; color?: string }> = [
    { key: 'start', label: 'Starting balance', swatch: colors.faint, value: money(checkingBalance) },
    { key: 'net', label: 'Take-home pay', swatch: colors.good, value: money(breakdown.net, { sign: true }), color: colors.good },
    { key: 'bills', label: 'Recurring bills', swatch: colors.bad, value: money(-bills), color: colors.bad },
    { key: 'variable', label: 'Variable budget', swatch: colors.warn, value: money(-variableBudget), color: colors.bad },
    { key: 'savings', label: 'Savings transfer', swatch: colors.indigo, value: money(-savingsTransfer), color: colors.bad },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Cash */}
      <View style={styles.firstHead}>
        <SectionHead title="Cash" action={syncing ? undefined : 'Sync'} onAction={handleSync} />
        {syncing ? <ActivityIndicator size="small" color={colors.teal} style={styles.syncSpinner} /> : null}
      </View>
      <Text style={styles.sectionTotal}>
        <Money style={styles.sectionTotalBold}>{money(totalCash)}</Money>
        {`  across ${cashAccounts.length} account${cashAccounts.length === 1 ? '' : 's'}`}
      </Text>

      <Card style={styles.acctCard}>
        {cashAccounts.map((a, i) => (
          <Pressable
            key={a.id}
            onPress={() => setEditingAccount(a)}
            style={({ pressed }) => [styles.acctRow, i === cashAccounts.length - 1 && styles.acctRowLast, pressed && styles.acctRowPressed]}
          >
            <AccountIcon kind={acctKind(a)} />
            <View style={styles.acctMain}>
              <Text style={styles.acctName} numberOfLines={1}>
                {displayName(a)}{a.mask ? ` ••${a.mask}` : ''}
              </Text>
              <Text style={styles.acctCaption} numberOfLines={1}>
                {`${a.institution ?? 'Manual'} · ${capitalize(a.subtype ?? a.type ?? 'cash')}`}
              </Text>
            </View>
            <View style={styles.acctRight}>
              <Money style={styles.acctBalance}>{money(a.balance)}</Money>
              <View style={[styles.badge, a.source === 'plaid' ? styles.badgeSynced : styles.badgeManual]}>
                <Text style={[styles.badgeText, a.source === 'plaid' ? styles.badgeTextSynced : styles.badgeTextManual]}>
                  {a.source === 'plaid' ? 'Synced' : 'Manual'}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}

        {cashAccounts.length === 0 ? (
          <Text style={styles.emptyHint}>No cash accounts yet — connect a bank below to pull real balances.</Text>
        ) : null}
      </Card>

      {/* Distinct Connect-a-bank CTA (manual add removed — Plaid link is the way in) */}
      <Pressable
        onPress={handleLink}
        disabled={linking}
        style={({ pressed }) => [styles.connectBtn, pressed && styles.connectBtnPressed, linking && styles.connectBtnBusy]}
      >
        {linking ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <PlusSquareGlyph color="#fff" />
            <Text style={styles.connectText}>Connect a bank</Text>
          </>
        )}
      </Pressable>

      {/* Cards (debt — shown separately from cash) */}
      {cardAccounts.length > 0 ? (
        <>
          <SectionHead title="Cards" />
          <Text style={styles.sectionTotal}>
            <Money style={[styles.sectionTotalBold, { color: colors.bad }]}>{money(cardDebt)}</Money>
            {`  owed across ${cardAccounts.length} card${cardAccounts.length === 1 ? '' : 's'}`}
          </Text>
          <View style={styles.cardGrid}>
            {cardAccounts.map((a) => {
              const tile = a.color ?? guessCardColor(`${a.institution ?? ''} ${a.name}`);
              const pend = pendingByAccount[a.id] ?? 0;
              const owed = (a.balance ?? 0) + pend;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setEditingAccount(a)}
                  style={({ pressed }) => [styles.cardTile, { backgroundColor: tile }, pressed && styles.cardTilePressed]}
                >
                  <View style={styles.cardTileTop}>
                    <Text style={styles.cardInst} numberOfLines={1}>{a.institution ?? 'Card'}</Text>
                    <Text style={styles.cardMask}>••{a.mask ?? '----'}</Text>
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>{displayName(a)}</Text>
                  <View style={styles.cardTileBottom}>
                    <View>
                      <Text style={styles.cardOwedLabel}>Balance owed</Text>
                      {pend !== 0 ? <Text style={styles.cardPending}>incl. {money(pend)} pending</Text> : null}
                    </View>
                    <Money style={styles.cardOwed}>{money(owed)}</Money>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Investments (asset, not cash) */}
      {investmentAccounts.length > 0 ? (
        <>
          <SectionHead title="Investments" />
          <Text style={styles.sectionTotal}>
            <Money style={styles.sectionTotalBold}>{money(investmentsTotal)}</Money>
            {`  across ${investmentAccounts.length} account${investmentAccounts.length === 1 ? '' : 's'}`}
          </Text>
          <Card style={styles.acctCard}>
            {investmentAccounts.map((a, i) => {
              const retire = isRetirement(a);
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setEditingAccount(a)}
                  style={({ pressed }) => [styles.acctRow, i === investmentAccounts.length - 1 && styles.acctRowLast, pressed && styles.acctRowPressed]}
                >
                  <View style={[styles.acctIcon, { backgroundColor: retire ? colors.indigo + '1A' : colors.blueBg }]}>
                    <InvestGlyph color={retire ? colors.indigo : colors.blue} />
                  </View>
                  <View style={styles.acctMain}>
                    <Text style={styles.acctName} numberOfLines={1}>{displayName(a)}{a.mask ? ` ••${a.mask}` : ''}</Text>
                    <Text style={styles.acctCaption} numberOfLines={1}>
                      {`${a.institution ?? 'Investments'} · ${capitalize(a.subtype ?? a.type ?? 'brokerage')}`}
                    </Text>
                  </View>
                  <View style={styles.acctRight}>
                    <Money style={styles.acctBalance}>{money(a.balance)}</Money>
                    <View style={[styles.badge, retire ? styles.badgeRetire : styles.badgeBroker]}>
                      <Text style={[styles.badgeText, retire ? styles.badgeTextRetire : styles.badgeTextBroker]}>
                        {retire ? 'Retirement' : 'Brokerage'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

      {/* Net worth line */}
      {(cardAccounts.length > 0 || investmentAccounts.length > 0) ? (
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net worth</Text>
          <Money style={[styles.netValue, { color: netWorth >= 0 ? colors.ink : colors.bad }]}>{money(netWorth)}</Money>
        </View>
      ) : null}

      <AccountEditor
        visible={editingAccount !== null}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />

      {/* End-of-month projection */}
      <SectionHead title="End-of-month projection" />
      <Card style={styles.calc}>
        <Text style={styles.calcLabel}>{`Where checking lands · ${monthName} ${lastDay}`}</Text>

        {ledger.map((row) => (
          <View key={row.key} style={styles.lrow}>
            <View style={styles.lrowLeft}>
              <Swatch color={row.swatch} />
              <Text style={styles.lrowLabel}>{row.label}</Text>
            </View>
            <Money style={[styles.lrowValue, row.color ? { color: row.color } : null] as never}>
              {row.value}
            </Money>
          </View>
        ))}

        <View style={[styles.lrow, styles.lrowTotal]}>
          <Text style={styles.totalLabel}>Projected balance</Text>
          <Money style={styles.totalValue}>{money(projection)}</Money>
        </View>
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  // The prototype's first sechead uses margin-top:8 instead of 18.
  firstHead: { marginTop: -10 },
  syncSpinner: { position: 'absolute', right: 2, top: 8 },
  sectionTotal: { fontSize: 13, color: colors.inkSoft, fontWeight: '500', marginTop: -4, marginBottom: 10, marginHorizontal: 2 },
  sectionTotalBold: { fontSize: 15, fontWeight: '800', color: colors.ink },
  // card tiles (debt)
  cardGrid: { gap: 11 },
  cardTile: { borderRadius: 16, padding: 16, minHeight: 104, justifyContent: 'space-between' },
  cardTilePressed: { opacity: 0.9 },
  cardTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInst: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '700', letterSpacing: 0.2, flex: 1 },
  cardMask: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2, marginTop: 10 },
  cardTileBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  cardOwedLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  cardOwed: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  cardPending: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '600', marginTop: 2 },
  badgeRetire: { backgroundColor: colors.indigo + '1A' },
  badgeTextRetire: { color: colors.indigo },
  badgeBroker: { backgroundColor: colors.blueBg },
  badgeTextBroker: { color: colors.blue },
  netRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginHorizontal: 2 },
  netLabel: { fontSize: 13.5, fontWeight: '700', color: colors.inkMid },
  netValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },

  // Account rows
  acctCard: { overflow: 'hidden' },
  emptyHint: { fontSize: 13, color: colors.greige, padding: 16, textAlign: 'center' },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.teal, height: 54, borderRadius: 15, marginTop: 12,
    shadowColor: colors.teal, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  connectBtnPressed: { opacity: 0.9 },
  connectBtnBusy: { opacity: 0.7 },
  connectText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  acctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  acctRowLast: { borderBottomWidth: 0 },
  acctRowPressed: { backgroundColor: colors.lineSoft },
  acctIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctMain: { flex: 1, minWidth: 0 },
  acctName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  acctCaption: { fontSize: 11, fontWeight: '500', color: colors.greige, marginTop: 2 },
  acctRight: { alignItems: 'flex-end', gap: 4 },
  acctBalance: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: colors.ink },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeSynced: { backgroundColor: colors.greenBg },
  badgeManual: { backgroundColor: colors.lineSoft },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  badgeTextSynced: { color: colors.green },
  badgeTextManual: { color: colors.inkSoft },

  // Projection ledger
  calc: { paddingVertical: 15, paddingHorizontal: 16 },
  calcLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.greige,
    marginBottom: 12,
  },
  lrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  lrowLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lrowLabel: { fontSize: 13.5, fontWeight: '500', color: colors.inkMid },
  lrowValue: { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },
  lrowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 6,
    paddingTop: 13,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  totalValue: { fontSize: 19, fontWeight: '800', color: colors.teal },

  // Add-account sheet
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.greige,
    marginTop: 16,
    marginBottom: 8,
  },
  inputWrap: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 15,
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  amtWrap: { flexDirection: 'row', alignItems: 'center' },
  amtPrefix: { fontSize: 22, fontWeight: '700', color: colors.ink },
  amtInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  goBtn: {
    marginTop: 18,
    height: 52,
    borderRadius: 15,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBtnDisabled: { opacity: 0.45 },
  goBtnPressed: { opacity: 0.88 },
  goText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: colors.card },
});
