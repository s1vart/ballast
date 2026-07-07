import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from './src/components/Screen';
import { ConnectBankButton } from './src/components/ConnectBankButton';
import { AccountsList } from './src/components/AccountsList';
import { getAccounts } from './src/db';
import type { Account } from './src/types';

/**
 * Minimal demo screen proving the real Plaid loop end to end:
 * tap "Connect a bank" → Plaid Link → backend exchange → balances synced locally.
 * This is the foundation to drop the full Ballast UI (from the prototype) on top of.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <Home />
    </SafeAreaProvider>
  );
}

function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const refresh = async () => setAccounts(await getAccounts());

  useEffect(() => {
    refresh();
  }, []);

  const total = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  return (
    <Screen>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>Ballast</Text>
        <Text style={styles.total}>
          ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </Text>
        <Text style={styles.totalLabel}>total cash across {accounts.length} account(s)</Text>
      </View>
      <View style={styles.body}>
        <AccountsList accounts={accounts} />
        <ConnectBankButton onConnected={refresh} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20, paddingTop: 16 },
  brand: { fontSize: 14, fontWeight: '700', color: '#0E5B57' },
  total: { fontSize: 40, fontWeight: '800', color: '#0E1726', marginTop: 6, letterSpacing: -1 },
  totalLabel: { fontSize: 13, color: '#8A8578', marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 8 },
});
