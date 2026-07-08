import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, money } from '../theme';
import { Card, Money, SectionHead, HBar } from '../components/ui';
import { GoalEditor } from '../components/GoalEditor';
import { useData } from '../data/DataContext';
import type { Goal } from '../db';

// ---------- inline icons (ported from the prototype's SVG paths) ----------

interface IconProps { color: string }

function ShieldIcon({ color }: IconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v5c0 4.2-2.9 6.9-7 8-4.1-1.1-7-3.8-7-8V6l7-3z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function HouseIcon({ color }: IconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11l8-6 8 6M6 10v9h12v-9"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function StarIcon({ color }: IconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 15.8 7.4 18.2l.9-5.1L4.5 9.5l5.2-.8L12 4z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BarChartIcon({ color }: IconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 19V9M12 19V5M19 19v-7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const GOAL_GLYPHS: Array<React.ComponentType<IconProps>> = [ShieldIcon, HouseIcon, StarIcon];

// ---------- helpers ----------

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ~14% opacity tint of a #RRGGBB color for the icon square background. */
const tint = (hex: string): string => `${hex}24`;

/** "Done ~Mar 2027" / "10+ yrs" / "Reached 🎉" projection for a goal's footer. */
function completionLabel(g: Goal, today: Date): string {
  if (g.current >= g.target) return 'Reached 🎉';
  if (g.monthly <= 0) return '—';
  const months = Math.ceil((g.target - g.current) / g.monthly);
  if (months > 120) return '10+ yrs';
  const done = new Date(today.getFullYear(), today.getMonth() + months, 1);
  return `Done ~${MONTH_ABBR[done.getMonth()]} ${done.getFullYear()}`;
}

// ---------- screen ----------

export function GoalsScreen() {
  const { goals, breakdown, paycheckConfig, today } = useData();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorGoal, setEditorGoal] = useState<Goal | null>(null);
  const openEditor = (g: Goal | null) => { setEditorGoal(g); setEditorOpen(true); };

  const investGoals = goals.filter((g) => g.kind === 'goal');
  const retirement = goals.find((g) => g.kind === 'retirement');

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.firstHead}>
        <SectionHead title="Investment goals" action="+ New" onAction={() => openEditor(null)} />
      </View>

      {investGoals.map((g, i) => {
        const Glyph = GOAL_GLYPHS[i % GOAL_GLYPHS.length];
        const pct = g.target > 0 ? (g.current / g.target) * 100 : 0;
        return (
          <Pressable key={g.id} onPress={() => openEditor(g)}>
          <Card style={styles.goalCard}>
            <View style={styles.headRow}>
              <View style={[styles.iconSq, { backgroundColor: tint(g.color) }]}>
                <Glyph color={g.color} />
              </View>
              <View style={styles.headMid}>
                <Text style={styles.goalName} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.goalSub}>
                  <Money>{money(g.monthly, { sign: true })}</Money> / mo
                </Text>
              </View>
              <Text style={[styles.goalPct, { color: g.color }]}>{Math.round(pct)}%</Text>
            </View>
            <View style={styles.barWrap}>
              <HBar pct={pct} color={g.color} track={colors.line} height={8} />
            </View>
            <View style={styles.foot}>
              <Text style={styles.footText}>
                <Money style={styles.footBold}>{money(g.current)}</Money>
                {' of '}
                <Money>{money(g.target)}</Money>
              </Text>
              <Text style={styles.footText}>{completionLabel(g, today)}</Text>
            </View>
          </Card>
          </Pressable>
        );
      })}

      {retirement ? (
        <>
          <SectionHead title="Retirement" />
          <Card style={styles.goalCard}>
            <View style={styles.headRow}>
              <View style={[styles.iconSq, { backgroundColor: colors.mintBg }]}>
                <BarChartIcon color={retirement.color} />
              </View>
              <View style={styles.headMid}>
                <Text style={styles.goalName} numberOfLines={1}>{retirement.name}</Text>
                <Text style={styles.goalSub}>
                  +<Money>{money(breakdown.contrib)}</Money>/mo + {paycheckConfig.matchPct}% match
                </Text>
              </View>
              <Money style={[styles.goalPct, { color: retirement.color }]}>
                {money(retirement.current)}
              </Money>
            </View>
            <View style={[styles.foot, styles.retFoot]}>
              <Text style={styles.footText}>
                Contributing <Text style={styles.footBold}>{paycheckConfig.contribPct}%</Text> of salary
              </Text>
              <Text style={styles.footText}>Adjust in Paycheck →</Text>
            </View>
          </Card>
        </>
      ) : null}

      <GoalEditor visible={editorOpen} goal={editorGoal} onClose={() => setEditorOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  // Prototype pulls the first section head up to 8px (SectionHead's own marginTop is 18).
  firstHead: { marginTop: -10 },
  goalCard: { paddingVertical: 15, paddingHorizontal: 16, marginBottom: 11 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconSq: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headMid: { flex: 1, minWidth: 0 },
  goalName: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  goalSub: { fontSize: 11.5, fontWeight: '500', color: colors.greige, marginTop: 2 },
  goalPct: { fontSize: 15, fontWeight: '700' },
  barWrap: { marginTop: 12 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  retFoot: { marginTop: 11 },
  footText: { fontSize: 11.5, fontWeight: '500', color: colors.inkSoft },
  footBold: { color: colors.ink, fontWeight: '700' },
});
