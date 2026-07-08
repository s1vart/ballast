import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, money } from '../theme';
import { SectionHead } from './ui';
import { BottomSheet, Chip } from './sheets';
import { useFeedback } from './Feedback';
import { useData } from '../data/DataContext';
import type { BankTxn } from '../db';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTH[m - 1]} ${d}`;
}

/** Recent synced transactions with a re-assign-to-envelope sheet. Pending badged. */
export function TransactionsList() {
  const { transactions, categories, syncTransactions, reassignTransaction } = useData();
  const { toast } = useFeedback();
  const [syncing, setSyncing] = useState(false);
  const [picking, setPicking] = useState<BankTxn | null>(null);

  const catName = useCallback(
    (id: string | null) => categories.find((c) => c.id === id)?.name ?? null,
    [categories]
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
            const outflow = t.amount > 0;
            const assigned = catName(t.envelopeId);
            return (
              <View key={t.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.merchant} numberOfLines={1}>{t.merchant || t.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.date}>{shortDate(t.date)}</Text>
                    {t.pending ? <View style={styles.pendingPill}><Text style={styles.pendingTx}>Pending</Text></View> : null}
                    <Pressable onPress={() => setPicking(t)} hitSlop={6}>
                      <Text style={[styles.envChip, !assigned && styles.envChipEmpty]}>
                        {assigned ?? 'Uncategorized'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.amount, outflow ? styles.amountOut : styles.amountIn]}>
                  {outflow ? '' : '+'}{money(Math.abs(t.amount))}
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 12 },
  rowMain: { flex: 1, minWidth: 0 },
  merchant: { fontSize: 14, fontWeight: '600', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  date: { fontSize: 11.5, color: colors.faint, fontWeight: '500' },
  pendingPill: { backgroundColor: colors.warn + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pendingTx: { fontSize: 9.5, fontWeight: '700', color: '#9A6B15', letterSpacing: 0.3, textTransform: 'uppercase' },
  envChip: { fontSize: 11.5, fontWeight: '600', color: colors.teal },
  envChipEmpty: { color: colors.faint },
  amount: { fontSize: 14.5, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  amountOut: { color: colors.ink },
  amountIn: { color: colors.good },
  pickSub: { fontSize: 13, color: colors.greige, fontWeight: '500', marginTop: 2, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
