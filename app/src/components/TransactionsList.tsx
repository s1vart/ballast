import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, money } from '../theme';
import { SectionHead } from './ui';
import { BottomSheet, Chip } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import { displayName } from '../types';
import { humanizeCategory, isTransfer } from '../logic/categorize';
import type { BankTxn } from '../db';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTH[m - 1]} ${d}`;
}

/** Recent synced transactions: account, date, category, amount. Card payments &
 *  transfers are shown muted (not spending) so they don't look like double charges. */
export function TransactionsList() {
  const { transactions, categories, accounts, syncTransactions, reassignTransaction } = useData();
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
            const transfer = isTransfer(t.pfc);
            const inflow = t.amount < 0;
            const label = transfer ? humanizeCategory(t.pfc, t.pfcDetailed) : catName(t.envelopeId) ?? humanizeCategory(t.pfc, t.pfcDetailed);
            return (
              <View key={t.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={[styles.merchant, transfer && styles.muted]} numberOfLines={1}>{t.merchant || t.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.acct} numberOfLines={1}>{acctName(t.accountId)}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.date}>{shortDate(t.date)}</Text>
                    {t.pending ? <View style={styles.pendingPill}><Text style={styles.pendingTx}>Pending</Text></View> : null}
                  </View>
                  {transfer ? (
                    <Text style={styles.transferTag}>{label}</Text>
                  ) : (
                    <Pressable onPress={() => setPicking(t)} hitSlop={6} style={styles.catChipWrap}>
                      <Text style={styles.catChip}>{label}</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={[styles.amount, transfer ? styles.amountMuted : inflow ? styles.amountIn : styles.amountOut]}>
                  {transfer ? '' : inflow ? '+' : ''}{money(Math.abs(t.amount))}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Re-assign envelope sheet */}
      <BottomSheet visible={picking !== null} onClose={() => setPicking(null)} title="Assign to envelope">
        {picking ? (
          <>
            <Text style={styles.pickSub}>{picking.merchant || picking.name} · {money(Math.abs(picking.amount))}</Text>
            <View style={styles.chips}>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={picking.envelopeId === c.id}
                  onPress={async () => { await reassignTransaction(picking.id, c.id); setPicking(null); }}
                />
              ))}
              <Chip
                label="Uncategorized"
                selected={picking.envelopeId === null}
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
  rowMain: { flex: 1, minWidth: 0 },
  merchant: { fontSize: 14, fontWeight: '600', color: colors.ink },
  muted: { color: colors.inkSoft },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  acct: { fontSize: 11.5, color: colors.greige, fontWeight: '600', maxWidth: 150 },
  dot: { fontSize: 11.5, color: colors.faint },
  date: { fontSize: 11.5, color: colors.faint, fontWeight: '500' },
  pendingPill: { backgroundColor: colors.warn + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 2 },
  pendingTx: { fontSize: 9.5, fontWeight: '700', color: '#9A6B15', letterSpacing: 0.3, textTransform: 'uppercase' },
  catChipWrap: { alignSelf: 'flex-start', marginTop: 6 },
  catChip: { fontSize: 11.5, fontWeight: '700', color: colors.teal, backgroundColor: colors.mintBg, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  transferTag: { alignSelf: 'flex-start', marginTop: 6, fontSize: 10.5, fontWeight: '700', color: colors.greige, backgroundColor: colors.lineSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', letterSpacing: 0.2, textTransform: 'uppercase' },
  amount: { fontSize: 14.5, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  amountOut: { color: colors.ink },
  amountIn: { color: colors.good },
  amountMuted: { color: colors.faint, fontWeight: '600' },
  pickSub: { fontSize: 13, color: colors.greige, fontWeight: '500', marginTop: 2, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
