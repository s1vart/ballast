import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { Screen } from './src/components/Screen';
import { FeedbackProvider } from './src/components/Feedback';
import { DataProvider, useData } from './src/data/DataContext';
import { colors } from './src/theme';
import { Onboarding } from './src/screens/Onboarding';
import { HomeScreen } from './src/screens/HomeScreen';
import { BudgetsScreen } from './src/screens/BudgetsScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { PaycheckScreen } from './src/screens/PaycheckScreen';

type Tab = 'home' | 'budgets' | 'goals' | 'accounts' | 'paycheck';

export default function App() {
  return (
    <SafeAreaProvider>
      <FeedbackProvider>
        <DataProvider>
          <Root />
        </DataProvider>
      </FeedbackProvider>
    </SafeAreaProvider>
  );
}

/** Gate first run on onboarding; otherwise show the main tab shell. */
function Root() {
  const { loading, onboarded } = useData();
  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      </Screen>
    );
  }
  return onboarded ? <Shell /> : <Onboarding />;
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <Screen edges={['top']}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeScreen />}
        {tab === 'budgets' && <BudgetsScreen />}
        {tab === 'goals' && <GoalsScreen />}
        {tab === 'accounts' && <AccountsScreen />}
        {tab === 'paycheck' && <PaycheckScreen />}
      </View>
      <TabBar tab={tab} onChange={setTab} />
    </Screen>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const items: Array<{ key: Tab; label: string; icon: (c: string) => React.ReactNode }> = [
    { key: 'home', label: 'Home', icon: (c) => (
      <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
        <Path d="M3.5 9L11 3.5L18.5 9V17.5a1 1 0 01-1 1H4.5a1 1 0 01-1-1V9z" stroke={c} strokeWidth={1.7} strokeLinejoin="round" />
        <Path d="M8.5 18.5v-5h5v5" stroke={c} strokeWidth={1.7} strokeLinejoin="round" />
      </Svg>
    )},
    { key: 'budgets', label: 'Budgets', icon: (c) => (
      <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
        <Rect x={3.5} y={3.5} width={15} height={15} rx={2.5} stroke={c} strokeWidth={1.7} />
        <Path d="M7 14v-3M11 14V8M15 14v-5" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    )},
    { key: 'goals', label: 'Goals', icon: (c) => (
      <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
        <Circle cx={11} cy={11} r={7.5} stroke={c} strokeWidth={1.7} />
        <Path d="M11 11l3.5-2M11 11V6" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    )},
    { key: 'accounts', label: 'Accounts', icon: (c) => (
      <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
        <Rect x={3} y={5.5} width={16} height={11} rx={2} stroke={c} strokeWidth={1.7} />
        <Path d="M3 9h16M14 13h2.5" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    )},
    { key: 'paycheck', label: 'Paycheck', icon: (c) => (
      <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
        <Rect x={3.5} y={4.5} width={15} height={13} rx={2} stroke={c} strokeWidth={1.7} />
        <Path d="M7 8.5h5M7 11.5h8" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    )},
  ];
  return (
    <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((it) => {
        const active = tab === it.key;
        const c = active ? colors.teal : colors.faint;
        return (
          <Pressable key={it.key} style={styles.tab} onPress={() => onChange(it.key)}>
            {it.icon(c)}
            <Text style={[styles.tabLabel, { color: c }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#EAECEF',
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingTop: 9,
    paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 9.5, fontWeight: '600' },
});
