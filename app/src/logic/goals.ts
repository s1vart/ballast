import type { Goal } from '../db';
import type { Account } from '../types';
import { contributionFor, RecurringTransfer } from './recurringTransfers';

/** Whole months from `today` to a YYYY-MM(-DD) target, at least 1. */
export function monthsUntil(iso: string, today: Date): number {
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return 1;
  const months = (y - today.getFullYear()) * 12 + (m - (today.getMonth() + 1));
  return Math.max(1, months);
}

/** Monthly amount needed to reach `target` from `current` by `iso`. */
export function requiredMonthly(target: number, current: number, iso: string, today: Date): number {
  const remaining = Math.max(0, target - current);
  return Math.ceil(remaining / monthsUntil(iso, today));
}

/** A goal's effective "saved so far" — the linked account's live balance, or the manual number. */
export function goalCurrent(goal: Goal, accounts: Account[]): number {
  if (goal.accountId) return accounts.find((a) => a.id === goal.accountId)?.balance ?? 0;
  return goal.current;
}

/** A goal's effective monthly contribution. Priority: target-date > recurring transfer > manual. */
export function goalMonthly(goal: Goal, current: number, transfers: RecurringTransfer[], today: Date): number {
  if (goal.targetDate) return requiredMonthly(goal.target, current, goal.targetDate, today);
  if (goal.contributionKey) return contributionFor(goal.contributionKey, transfers) ?? 0;
  return goal.monthly;
}
