import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme';
import { BottomSheet } from './sheets';
import { STATES, StateInfo, stateRateLabel } from '../logic/stateTax';

/** Searchable state picker. Selecting a state hands back its code + built-in tax rate. */
export function StatePicker({
  visible, onClose, onSelect, selectedCode,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (s: StateInfo) => void;
  selectedCode?: string | null;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STATES;
    return STATES.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q);
  }, [query]);

  // reset search each time the sheet opens
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setQuery('');
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Where do you pay state taxes?" scroll={false}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search states…"
          placeholderTextColor={colors.faint}
          autoCorrect={false}
        />
      </View>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {filtered.map((s) => {
          const selected = s.code === selectedCode;
          return (
            <Pressable
              key={s.code}
              style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
              onPress={() => { onSelect(s); onClose(); }}
            >
              <Text style={[styles.name, selected && styles.nameSelected]}>{s.name}</Text>
              <Text style={[styles.rate, s.kind === 'none' && styles.rateNone]}>{stateRateLabel(s)}</Text>
            </Pressable>
          );
        })}
        {filtered.length === 0 ? <Text style={styles.empty}>No matches</Text> : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchWrap: { marginTop: 12, borderWidth: 1.5, borderColor: '#E4E7EB', borderRadius: 14, paddingHorizontal: 15 },
  search: { fontSize: 16, fontWeight: '600', color: colors.ink, paddingVertical: 12 },
  // flexGrow 0 + flexShrink 1: capped at 420 normally, but compresses (and stays
  // scrollable) when the keyboard shrinks the sheet instead of hiding behind it.
  list: { marginTop: 10, maxHeight: 420, flexGrow: 0, flexShrink: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  rowSelected: { backgroundColor: colors.mintBg, borderRadius: 10, paddingHorizontal: 10 },
  pressed: { opacity: 0.7 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  nameSelected: { color: colors.teal },
  rate: { fontSize: 12.5, fontWeight: '600', color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  rateNone: { color: colors.good },
  empty: { textAlign: 'center', color: colors.greige, paddingVertical: 24, fontSize: 14 },
});
