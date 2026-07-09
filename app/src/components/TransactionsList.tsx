import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, money } from '../theme';
import { SectionHead } from './ui';
import { BottomSheet, Chip } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import { displayName } from '../types';
import { humanizeCategory, isTransfer, isFixed } from '../logic/categorize';
import type { BankTxn } from '../db';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTH[m - 1]} ${d}`;
}

/** Recent synced transactions. Tap any one to recategorize: assign a spending
 *  envelope, or mark it a bill/necessity so it's excluded from discretionary spend
 *  (fixes cases where the bank mis-tags something like rent). */
export function TransactionsList() {
  const { transactions, categories, accounts, syncTransactions, reassignTransaction, setTransactionExcluded } = useData();
  const { toast } = useFeedback();
  const [syncing, setSyncing] = useState(false);
  const [picking, setPicking] = useState<BankTxn | null>(null);

  const catName = useCallback((id: string | null) => categories.find((c) => c.id === id)?.name ?? null, [categories]);
  const acctName = useCallback(
    (id: string | null) => {
      const a = accounts.find((x) => x.id === id);
      return a ? displayName(a) : 'Account';
    },
    [accounts]
  );

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const n = await syncTransactions();
      toast(n > 0 ? `Synced ${n} transaction${n === 1 ? '' : 's'}` : 'Up to date');
    } catch {
      toast('Could not sync — is the server running?');
    } finally {
      setSyncing(false);
    }
  }, [syncing, syncTransactions, toast]);

  return (
    <View>
      <View style={styles.head}>
        <SectionHead title="Recent activity" action={syncing ? undefined : 'Sync'} onAction={sync} />
        {syncing ? <ActivityIndicator size="small" color={colors.teal} style={styles.spinner} /> : null}
      </View>

      {transactions.length === 0 ? (
        <Text style={styles.empty}>No transactions yet. Tap Sync to pull them from your linked banks.</Text>
      ) : (
        <View style={styles.list}>
          {transactions.map((t) => {
            const bill = t.excluded === 1;
            const auto = isTransfer(t.pfc) || isFixed(t.pfc);
            const nonSpend = bill || auto;
            const inflow = t.amount < 0;
            const label = bill ? 'Bill' : auto ? humanizeCategory(t.pfc, t.pfcDetailed) : catName(t.envelopeId) ?? humanizeCategory(t.pfc, t.pfcDetailed);
            return (
              <Pressable key={t.id} onPress={() => setPicking(t)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={styles.rowMain}>
                  <Text style={[styles.merchant, nonSpend && styles.muted]} numberOfLines={1}>{t.merchant || t.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.acct} numberOfLines={1}>{acctName(t.accountId)}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.date}>{shortDate(t.date)}</Text>
                    {t.pending ? <View style={styles.pendingPill}><Text style={styles.pendingTx}>Pending</Text></View> : null}
                  </View>
                  <Text style={[styles.tag, nonSpend ? styles.tagMuted : styles.tagSpend]}>{label}</Text>
                </View>
                <Text style={[styles.amount, nonSpend ? styles.amountMuted : inflow ? styles.amountIn : styles.amountOut]}>
                  {nonSpend ? '' : inflow ? '+' : ''}{money(Math.abs(t.amount))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Recategorize sheet */}
      <BottomSheet visible={picking !== null} onClose={() => setPicking(null)} title="Categorize">
        {picking ? (
          <>
            <Text style={styles.pickSub}>{picking.merchant || picking.name} · {money(Math.abs(picking.amount))}</Text>
            <Text style={styles.pickHint}>Put it in a spending envelope, or mark it a bill/necessity so it doesn't count toward spending.</Text>
            <View style={styles.chips}>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={picking.excluded !== 1 && picking.envelopeId === c.id}
                  onPress={async () => { await reassignTransaction(picking.id, c.id); setPicking(null); }}
                />
              ))}
            </View>
            <Text style={styles.pickDivider}>Not spending</Text>
            <View style={styles.chips}>
              <Chip
                label="Bill / necessity"
                selected={picking.excluded === 1}
                onPress={async () => { await setTransactionExcluded(picking.id, true); setPicking(null); }}
              />
              <Chip
                label="Uncategorized"
                selected={picking.excluded !== 1 && picking.envelopeId === null}
                onPress={async () => { await reassignTransaction(picking.id, null); setPicking(null); }}
              />
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { position: 'relative' },
  spinner: { position: 'absolute', right: 2, top: 26 },
  empty: { fontSize: 13, color: colors.greige, lineHeight: 19, paddingVertical: 10, paddingHorizontal: 2 },
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 12 },
  rowPressed: { backgroundColor: colors.lineSoft },
  rowMain: { flex: 1, minWidth: 0 },
  merchant: { fontSize: 14, fontWeight: '600', color: colors.ink },
  muted: { color: colors.inkSoft },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  acct: { fontSize: 11.5, color: colors.greige, fontWeight: '600', maxWidth: 150 },
  dot: { fontSize: 11.5, color: colors.faint },
  date: { fontSize: 11.5, color: colors.faint, fontWeight: '500' },
  pendingPill: { backgroundColor: colors.warn + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 2 },
  pendingTx: { fontSize: 9.5, fontWeight: '700', color: '#9A6B15', letterSpacing: 0.3, textTransform: 'uppercase' },
  tag: { alignSelf: 'flex-start', marginTop: 6, fontSize: 11.5, fontWeight: '700', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  tagSpend: { color: colors.teal, backgroundColor: colors.mintBg },
  tagMuted: { color: colors.greige, backgroundColor: colors.lineSoft },
  amount: { fontSize: 14.5, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  amountOut: { color: colors.ink },
  amountIn: { color: colors.good },
  amountMuted: { color: colors.faint, fontWeight: '600' },
  pickSub: { fontSize: 13, color: colors.greige, fontWeight: '500', marginTop: 2 },
  pickHint: { fontSize: 12.5, color: colors.greige, lineHeight: 18, marginTop: 6, marginBottom: 4 },
  pickDivider: { fontSize: 11, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});
