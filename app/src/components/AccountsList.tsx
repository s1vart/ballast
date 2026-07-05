import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import type { Account } from '../types';

const money = (n: number | null) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export function AccountsList({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return <Text style={styles.empty}>No accounts yet. Connect a bank or add one manually.</Text>;
  }
  return (
    <FlatList
      data={accounts}
      keyExtractor={(a) => a.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {item.name}
              {item.mask ? ` ••${item.mask}` : ''}
            </Text>
            <Text style={styles.sub}>
              {item.institution ?? 'Manual'} · {item.subtype ?? item.type ?? ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.bal}>{money(item.balance)}</Text>
            <Text style={[styles.badge, item.source === 'plaid' ? styles.synced : styles.manual]}>
              {item.source === 'plaid' ? 'Synced' : 'Manual'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F2',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#0E1726' },
  sub: { fontSize: 12, color: '#8A8578', marginTop: 2 },
  bal: { fontSize: 16, fontWeight: '800', color: '#0E1726' },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  synced: { color: '#0F6E42', backgroundColor: '#E7F4EC' },
  manual: { color: '#8A8578', backgroundColor: '#F1EFEA' },
  empty: { color: '#8A8578', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
