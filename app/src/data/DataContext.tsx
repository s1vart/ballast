import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Account } from '../types';
import * as db from '../db';
import {
  paycheck, projectEndOfMonth, monthTrajectory, daysLeftInMonth,
  PaycheckConfig, PaycheckBreakdown, Recurring, TrajectoryPoint,
} from '../logic/finance';
import { fetchPlaidAccounts } from '../api';

export interface BallastData {
  loading: boolean;
  accounts: Account[];
  categories: db.Category[];
  spentByCategory: Record<string, number>;
  recurring: Recurring[];
  goals: db.Goal[];
  income: db.Income[];
  paycheckConfig: PaycheckConfig;
  breakdown: PaycheckBreakdown;
  savingsTransfer: number;
  // derived
  totalCash: number;
  checkingBalance: number;
  projection: number;
  trajectory: TrajectoryPoint[];
  daysLeft: number;
  projectedAnnualIncome: number;
  today: Date;
  // actions
  refresh: () => Promise<void>;
  addExpense: (categoryId: string, amount: number, note?: string) => Promise<void>;
  addAccount: (name: string, balance: number) => Promise<void>;
  updatePaycheck: (cfg: PaycheckConfig) => Promise<void>;
  setCategoryLimit: (id: string, limit: number) => Promise<void>;
  syncBank: () => Promise<number>; // returns # of accounts synced
  // recurring bills
  addRecurring: (name: string, category: string, amount: number, dayOfMonth: number) => Promise<void>;
  updateRecurring: (id: string, f: { name: string; category: string; amount: number; dayOfMonth: number }) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  // goals
  addGoal: (f: { name: string; target: number; current: number; monthly: number; color: string }) => Promise<void>;
  updateGoal: (id: string, f: { name: string; target: number; current: number; monthly: number }) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  // income
  addIncome: (f: { kind: db.IncomeKind; label: string; amount: number; date: string }) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
}

const Ctx = createContext<BallastData | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [spentByCategory, setSpent] = useState<Record<string, number>>({});
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [goals, setGoals] = useState<db.Goal[]>([]);
  const [income, setIncome] = useState<db.Income[]>([]);
  const [paycheckConfig, setPc] = useState<PaycheckConfig>({ grossAnnual: 98000, contribPct: 8, matchPct: 4, taxPct: 26 });
  const [savingsTransfer, setTransfer] = useState(0);

  const refresh = useCallback(async () => {
    const [acc, cats, spent, rec, gls, inc, pc, tr] = await Promise.all([
      db.getAccounts(), db.getCategories(), db.getMonthSpend(),
      db.getRecurring(), db.getGoals(), db.getIncome(), db.getPaycheckConfig(), db.getSavingsTransfer(),
    ]);
    setAccounts(acc); setCategories(cats); setSpent(spent);
    setRecurring(rec); setGoals(gls); setIncome(inc); setPc(pc); setTransfer(tr);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addExpense = useCallback(async (categoryId: string, amount: number, note?: string) => {
    await db.addTxn(categoryId, amount, note);
    await refresh();
  }, [refresh]);

  const addAccount = useCallback(async (name: string, balance: number) => {
    await db.addManualAccount(name, balance);
    await refresh();
  }, [refresh]);

  const updatePaycheck = useCallback(async (cfg: PaycheckConfig) => {
    setPc(cfg);                    // optimistic — stepper stays live
    await db.setPaycheckConfig(cfg);
  }, []);

  const setCategoryLimit = useCallback(async (id: string, limit: number) => {
    await db.setCategoryLimit(id, limit);
    await refresh();
  }, [refresh]);

  const syncBank = useCallback(async () => {
    const remote = await fetchPlaidAccounts();
    await db.upsertAccounts(remote);
    await refresh();
    return remote.length;
  }, [refresh]);

  const addRecurring = useCallback(async (name: string, category: string, amount: number, dayOfMonth: number) => {
    await db.addRecurring(name, category, amount, dayOfMonth);
    await refresh();
  }, [refresh]);

  const updateRecurring = useCallback(async (id: string, f: { name: string; category: string; amount: number; dayOfMonth: number }) => {
    await db.updateRecurring(id, f);
    await refresh();
  }, [refresh]);

  const deleteRecurring = useCallback(async (id: string) => {
    await db.deleteRecurring(id);
    await refresh();
  }, [refresh]);

  const addGoal = useCallback(async (f: { name: string; target: number; current: number; monthly: number; color: string }) => {
    await db.addGoal(f);
    await refresh();
  }, [refresh]);

  const updateGoal = useCallback(async (id: string, f: { name: string; target: number; current: number; monthly: number }) => {
    await db.updateGoal(id, f);
    await refresh();
  }, [refresh]);

  const deleteGoal = useCallback(async (id: string) => {
    await db.deleteGoal(id);
    await refresh();
  }, [refresh]);

  const addIncome = useCallback(async (f: { kind: db.IncomeKind; label: string; amount: number; date: string }) => {
    await db.addIncome(f);
    await refresh();
  }, [refresh]);

  const deleteIncome = useCallback(async (id: string) => {
    await db.deleteIncome(id);
    await refresh();
  }, [refresh]);

  const value = useMemo<BallastData>(() => {
    const breakdown = paycheck(paycheckConfig);
    const totalCash = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    const checking = accounts.find((a) => (a.subtype ?? a.type ?? '').includes('checking'));
    const checkingBalance = checking?.balance ?? totalCash;
    const bills = recurring.reduce((s, b) => s + b.amount, 0);
    const variableBudget = categories.reduce((s, c) => s + c.monthlyLimit, 0);
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const thisYear = String(today.getFullYear());
    const incomeThisYear = income
      .filter((i) => i.date.slice(0, 4) === thisYear)
      .reduce((s, i) => s + i.amount, 0);
    const input = {
      startingBalance: checkingBalance,
      netMonthly: breakdown.net,
      bills,
      variableBudget,
      savingsTransfer,
    };
    return {
      loading, accounts, categories, spentByCategory, recurring, goals, income,
      paycheckConfig, breakdown, savingsTransfer,
      totalCash, checkingBalance,
      projection: projectEndOfMonth(input),
      trajectory: monthTrajectory(input, recurring, daysInMonth, today.getDate()),
      daysLeft: daysLeftInMonth(today),
      projectedAnnualIncome: paycheckConfig.grossAnnual + incomeThisYear,
      today,
      refresh, addExpense, addAccount, updatePaycheck, setCategoryLimit, syncBank,
      addRecurring, updateRecurring, deleteRecurring,
      addGoal, updateGoal, deleteGoal,
      addIncome, deleteIncome,
    };
  }, [loading, accounts, categories, spentByCategory, recurring, goals, income, paycheckConfig, savingsTransfer,
      refresh, addExpense, addAccount, updatePaycheck, setCategoryLimit, syncBank,
      addRecurring, updateRecurring, deleteRecurring, addGoal, updateGoal, deleteGoal, addIncome, deleteIncome]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): BallastData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
