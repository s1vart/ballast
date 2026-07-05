import React, { useState } from 'react';
import { Pressable, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { connectBank } from '../plaidLink';
import { fetchPlaidAccounts } from '../api';
import { upsertAccounts } from '../db';

export function ConnectBankButton({ onConnected }: { onConnected: () => void }) {
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const { institution } = await connectBank();
      // Pull fresh balances and save them locally as synced accounts.
      const accounts = await fetchPlaidAccounts();
      await upsertAccounts(accounts);
      onConnected();
      Alert.alert('Connected', `Linked ${institution ?? 'your bank'} · synced ${accounts.length} account(s).`);
    } catch (e: any) {
      if (e?.message !== 'cancelled') {
        Alert.alert('Could not connect', e?.message ?? 'Unknown error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={go} disabled={busy}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.txt}>+ Connect a bank</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: '#0E5B57', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  pressed: { opacity: 0.85 },
  txt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
