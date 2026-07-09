import type { BankTxn } from '../db';

export interface RecurringTransfer {
  key: string;     // normalized payee — stable id a goal links to
  label: string;   // human-readable payee
  monthly: number; // typical amount per occurrence
  count: number;   // how many times it's been seen
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Recurring OUTGOING transfers (checking → Roth/savings deposits, etc.) detected
 *  from the transaction feed: same payee, repeating across 2+ calendar months.
 *  A goal can link to one of these so its monthly contribution stays live. */
export function detectRecurringTransfers(txns: BankTxn[]): RecurringTransfer[] {
  const groups = new Map<string, { label: string; amounts: number[]; months: Set<string> }>();
  for (const t of txns) {
    if (t.pfc !== 'TRANSFER_OUT' || t.amount <= 0) continue; // money leaving to another account
    const name = t.merchant || t.name || 'Transfer';
    const key = norm(name);
    if (!key) continue;
    const g = groups.get(key) ?? { label: name, amounts: [], months: new Set<string>() };
    g.amounts.push(t.amount);
    g.months.add(t.date.slice(0, 7));
    groups.set(key, g);
  }
  const out: RecurringTransfer[] = [];
  for (const [key, g] of groups) {
    if (g.amounts.length >= 2 && g.months.size >= 2) {
      out.push({ key, label: g.label, monthly: Math.round(median(g.amounts)), count: g.amounts.length });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** The live monthly amount for a goal's linked recurring transfer, or null. */
export function contributionFor(key: string | null | undefined, list: RecurringTransfer[]): number | null {
  if (!key) return null;
  const found = list.find((r) => r.key === key);
  return found ? found.monthly : null;
}
