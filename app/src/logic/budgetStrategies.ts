// Budget-suggestion strategies. Pure functions over the user's envelopes,
// average spending, take-home income, and fixed bills. Amounts round to $5.

export type StrategyId = 'spending' | 'r503020' | 'r702010' | 'zero';

export interface Strategy {
  id: StrategyId;
  name: string;
  tagline: string;
  description: string;
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'spending',
    name: 'Match my spending',
    tagline: 'Data-driven',
    description: 'Set each envelope to what you actually average per month. The most realistic starting point — then trim where you want to cut back.',
  },
  {
    id: 'r503020',
    name: '50 / 30 / 20',
    tagline: 'The classic',
    description: '50% of take-home to needs, 30% to wants, 20% to savings & debt. Balanced and popular.',
  },
  {
    id: 'r702010',
    name: '70 / 20 / 10',
    tagline: 'Simple',
    description: '70% to living expenses, 20% to savings, 10% to debt or giving. Roomier day-to-day.',
  },
  {
    id: 'zero',
    name: 'Zero-based',
    tagline: 'Every dollar a job',
    description: 'Start from your real spending, then assign every remaining dollar until nothing is left unbudgeted.',
  },
];

export interface Envelope {
  id: string;
  name: string;
  monthlyLimit: number;
}

export interface StrategyInput {
  strategyId: StrategyId;
  envelopes: Envelope[];
  avgSpend: Record<string, number>; // avg monthly spend per envelope
  takeHome: number;                 // monthly net income
  bills: number;                    // fixed recurring total (a "need")
}

export interface StrategyResult {
  suggested: Record<string, number>; // per-envelope suggested monthly limit
  savingsTarget: number;             // suggested monthly savings/debt (not an envelope)
  available: number;                 // take-home − bills − savingsTarget (for variable envelopes)
  note: string;
}

const r5 = (n: number): number => Math.max(0, Math.round(n / 5) * 5);

/** A need is essentials; everything else is a want. Covers the seeded envelopes
 *  by id and falls back to keyword matching for custom ones. */
const NEED_IDS = new Set(['groceries', 'transport', 'health', 'bills']);
function isNeed(e: Envelope): boolean {
  if (NEED_IDS.has(e.id)) return true;
  return /grocer|rent|utilit|health|medical|transport|gas|insurance|fuel/i.test(e.name);
}

/** Distribute a pool across envelopes, weighted by avg spend (equal split if no spend). */
function allocate(pool: number, entries: Array<{ id: string; weight: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  if (entries.length === 0) return out;
  if (pool <= 0) {
    for (const e of entries) out[e.id] = 0;
    return out;
  }
  const totalW = entries.reduce((s, e) => s + e.weight, 0);
  for (const e of entries) out[e.id] = totalW > 0 ? pool * (e.weight / totalW) : pool / entries.length;
  return out;
}

export function computeSuggestions(i: StrategyInput): StrategyResult {
  const { envelopes, avgSpend, takeHome, bills } = i;
  const weight = (e: Envelope) => avgSpend[e.id] ?? 0;

  if (i.strategyId === 'spending' || i.strategyId === 'zero') {
    const suggested: Record<string, number> = {};
    let sum = 0;
    for (const e of envelopes) {
      const v = r5(avgSpend[e.id] ?? e.monthlyLimit);
      suggested[e.id] = v;
      sum += v;
    }
    const savingsTarget = Math.max(0, takeHome - bills - sum);
    return {
      suggested,
      savingsTarget,
      available: Math.max(0, takeHome - bills),
      note:
        i.strategyId === 'zero'
          ? 'Adjust envelopes until “left to assign” hits $0 — every dollar gets a job.'
          : 'Suggested from your average monthly spending. Tweak any that feel off.',
    };
  }

  // Ratio strategies
  const [needPct, wantPct, savePct] = i.strategyId === 'r503020' ? [0.5, 0.3, 0.2] : [0.7, 0.2, 0.1];
  const savingsTarget = r5(takeHome * savePct);
  const needs = envelopes.filter(isNeed);
  const wants = envelopes.filter((e) => !isNeed(e));

  const suggested: Record<string, number> = {};
  if (i.strategyId === 'r503020') {
    // Needs bucket already includes fixed bills; envelopes get the remainder.
    const needsPool = Math.max(0, takeHome * needPct - bills);
    const wantsPool = takeHome * wantPct;
    const a = allocate(needsPool, needs.map((e) => ({ id: e.id, weight: weight(e) })));
    const b = allocate(wantsPool, wants.map((e) => ({ id: e.id, weight: weight(e) })));
    for (const e of envelopes) suggested[e.id] = r5(a[e.id] ?? b[e.id] ?? 0);
  } else {
    // 70/20/10: 70% living = bills + all envelopes; envelopes share the remainder.
    const livingPool = Math.max(0, takeHome * needPct - bills);
    const a = allocate(livingPool, envelopes.map((e) => ({ id: e.id, weight: weight(e) })));
    for (const e of envelopes) suggested[e.id] = r5(a[e.id] ?? 0);
  }

  return {
    suggested,
    savingsTarget,
    available: Math.max(0, takeHome - bills - savingsTarget),
    note: `${Math.round(needPct * 100)}% needs · ${Math.round(wantPct * 100)}% wants · ${Math.round(savePct * 100)}% savings, from your ${'$' + Math.round(takeHome).toLocaleString()} take-home.`,
  };
}
