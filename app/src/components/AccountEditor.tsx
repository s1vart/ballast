import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, CARD_COLORS } from '../theme';
import { BottomSheet, Field, PrimaryButton } from './sheets';
import { useData } from '../data/DataContext';
import { Account, isLiability } from '../types';

/** Edit an account's display metadata: nickname (fixes generic names like "Credit Card")
 *  and, for cards, a tile color. These survive Plaid re-syncs. */
export function AccountEditor({ visible, account, onClose }: { visible: boolean; account: Account | null; onClose: () => void }) {
  const { updateAccountMeta } = useData();
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState<string | null>(null);

  // Re-seed fields whenever the sheet opens for a different account.
  const [lastId, setLastId] = useState<string | null>(null);
  const key = visible ? account?.id ?? null : null;
  if (key !== lastId) {
    setLastId(key);
    setNickname(account?.nickname ?? '');
    setColor(account?.color ?? null);
  }

  if (!account) return null;
  const card = isLiability(account);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit account">
      <Text style={styles.orig}>
        {account.name}{account.mask ? ` ••${account.mask}` : ''} · {account.institution ?? 'Manual'}
      </Text>
      <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder={account.name} autoFocus />
      {card ? (
        <>
          <Text style={styles.colorLabel}>Card color</Text>
          <View style={styles.colorRow}>
            {CARD_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
              />
            ))}
          </View>
        </>
      ) : null}
      <PrimaryButton
        label="Save"
        onPress={async () => {
          await updateAccountMeta(account.id, { nickname: nickname.trim() || null, color });
          onClose();
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  orig: { fontSize: 12.5, color: colors.greige, fontWeight: '500', marginTop: 2 },
  colorLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase',
    color: colors.greige, marginTop: 18, marginBottom: 10,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 34, height: 34, borderRadius: 9 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
});
