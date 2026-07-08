import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Account } from '../types';
import { isCash, isLiability } from '../types';
import * as db from '../db';
import {
  paycheck, projectEndOfMonth, monthTrajectory, daysLeftInMonth,
  PaycheckConfig, PaycheckBreakdown, Recurring, TrajectoryPoint,
} from '../logic/finance';
import { TaxEstimate } from '../logic/tax';
import { summarizeProfile } from '../logic/profile';
import { fetchPlaidAccounts } from '../api';
import { connectBank } from '../plaidLink';

export interface TaxSummary {
  w2AnnualGross: number;
  annual1099Net: number;
  estimate: TaxEstimate;
  annualTax: number;      // estimate.total, or the user's override
  overridden: boolean;
  targetToDate: number;   // how much should be set aside by now (prorated by 1099 earned)
  setAside: number;
  gap: number;            // setAside - targetToDate (positive = ahead, negative = behind)
  nextQuarterly: { label: string; due: Date } | null;
}

export interface BallastData {
  loading: boolean;
  onboarded: boolean;
  profile: db.Profile | null;
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
  totalCash: number;    // depository accounts only (excludes card/loan debt)
  cardDebt: number;     // sum of credit/loan balances owed
  netWorth: number;     // totalCash - cardDebt
  checkingBalance: number;
  monthlyNetIncome: number;
  projection: number;
  trajectory: TrajectoryPoint[];
  daysLeft: number;
  projectedAnnualIncome: number;
  tax: TaxSummary | null;
  today: Date;
  // actions
  refresh: () => Promise<void>;
  completeOnboarding: (profile: db.Profile, startingAccounts: Array<{ name: string; balance: number }>) => Promise<void>;
  updateProfile: (patch: Partial<db.Profile>) => Promise<void>;
  addExpense: (categoryId: string, amount: number, note?: string) => Promise<void>;
  addAccount: (name: string, balance: number) => Promise<void>;
  updateAccountMeta: (id: string, f: { nickname: string | null; color: string | null }) => Promise<void>;
  updatePaycheck: (cfg: PaycheckConfig) => Promise<void>;
  setCategoryLimit: (id: string, limit: number) => Promise<void>;
  addCategory: (name: string, limit: number) => Promise<void>;
  updateCategory: (id: string, f: { name: string; monthlyLimit: number }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  syncBank: () => Promise<number>;
  linkBank: () => Promise<{ institution: string | null; count: number }>;
  restartOnboarding: () => Promise<void>;
  addRecurring: (name: string, category: string, amount: number, dayOfMonth: number) => Promise<void>;
  updateRecurring: (id: string, f: { name: string; category: string; amount: number; dayOfMonth: number }) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  addGoal: (f: { name: string; target: number; current: number; monthly: number; color: string }) => Promise<void>;
  updateGoal: (id: string, f: { name: string; target: number; current: number; monthly: number }) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addIncome: (f: { kind: db.IncomeKind; label: string; amount: number; date: string }) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
}

const Ctx = createContext<BallastData | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [profile, setProfileState] = useState<db.Profile | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<db.Category[]>([]);
  const [spentByCategory, setSpent] = useState<Record<string, number>>({});
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [goals, setGoals] = useState<db.Goal[]>([]);
  const [income, setIncome] = useState<db.Income[]>([]);
  const [paycheckConfig, setPc] = useState<PaycheckConfig>({ grossAnnual: 98000, contribPct: 8, matchPct: 4, taxPct: 26 });
  const [savingsTransfer, setTransfer] = useState(0);

  const refresh = useCallback(async () => {
    const [ob, prof, acc, cats, spent, rec, gls, inc, pc, tr] = await Promise.all([
      db.isOnboarded(), db.getProfile(), db.getAccounts(), db.getCategories(), db.getMonthSpend(),
      db.getRecurring(), db.getGoals(), db.getIncome(), db.getPaycheckConfig(), db.getSavingsTransfer(),
    ]);
    setOnboarded(ob); setProfileState(prof);
    setAccounts(acc); setCategories(cats); setSpent(spent);
    setRecurring(rec); setGoals(gls); setIncome(inc); setPc(pc); setTransfer(tr);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const completeOnboarding = useCallback(async (p: db.Profile, startingAccounts: Array<{ name: string; balance: number }>) => {
    await db.wipeDemoData();
    for (const a of startingAccounts) await db.addManualAccount(a.name, a.balance);
    await db.setProfile(p);
    await db.setOnboarded(true);
    await refresh();
  }, [refresh]);

  const updateProfile = useCallback(async (patch: Partial<db.Profile>) => {
    const current = await db.getProfile();
    if (!current) return;
    await db.setProfile({ ...current, ...patch });
    await refresh();
  }, [refresh]);

  const addExpense = useCallback(async (categoryId: string, amount: number, note?: string) => { await db.addTxn(categoryId, amount, note); await refresh(); }, [refresh]);
  const addAccount = useCallback(async (name: string, balance: number) => { await db.addManualAccount(name, balance); await refresh(); }, [refresh]);
  const updateAccountMeta = useCallback(async (id: string, f: { nickname: string | null; color: string | null }) => { await db.updateAccountMeta(id, f); await refresh(); }, [refresh]);
  const updatePaycheck = useCallback(async (cfg: PaycheckConfig) => { setPc(cfg); await db.setPaycheckConfig(cfg); }, []);
  const setCategoryLimit = useCallback(async (id: string, limit: number) => { await db.setCategoryLimit(id, limit); await refresh(); }, [refresh]);
  const syncBank = useCallback(async () => { const r = await fetchPlaidAccounts(); await db.upsertAccounts(r); await refresh(); return r.length; }, [refresh]);
  const addCategory = useCallback(async (name: string, limit: number) => { await db.addCategory(name, limit); await refresh(); }, [refresh]);
  const updateCategory = useCallback(async (id: string, f: { name: string; monthlyLimit: number }) => { await db.updateCategory(id, f); await refresh(); }, [refresh]);
  const deleteCategory = useCallback(async (id: string) => { await db.deleteCategory(id); await refresh(); }, [refresh]);
  const linkBank = useCallback(async () => {
    const { institution } = await connectBank();          // opens Plaid Link natively
    const remote = await fetchPlaidAccounts();            // pull balances for all linked items
    await db.upsertAccounts(remote);
    await refresh();
    return { institution, count: remote.length };
  }, [refresh]);
  const restartOnboarding = useCallback(async () => {
    await db.setOnboarded(false);                          // data stays until the new setup finishes (which wipes)
    await refresh();
  }, [refresh]);
  const addRecurring = useCallback(async (name: string, category: string, amount: number, dayOfMonth: number) => { await db.addRecurring(name, category, amount, dayOfMonth); await refresh(); }, [refresh]);
  const updateRecurring = useCallback(async (id: string, f: { name: string; category: string; amount: number; dayOfMonth: number }) => { await db.updateRecurring(id, f); await refresh(); }, [refresh]);
  const deleteRecurring = useCallback(async (id: string) => { await db.deleteRecurring(id); await refresh(); }, [refresh]);
  const addGoal = useCallback(async (f: { name: string; target: number; current: number; monthly: number; color: string }) => { await db.addGoal(f); await refresh(); }, [refresh]);
  const updateGoal = useCallback(async (id: string, f: { name: string; target: number; current: number; monthly: number }) => { await db.updateGoal(id, f); await refresh(); }, [refresh]);
  const deleteGoal = useCallback(async (id: string) => { await db.deleteGoal(id); await refresh(); }, [refresh]);
  const addIncome = useCallback(async (f: { kind: db.IncomeKind; label: string; amount: number; date: string }) => { await db.addIncome(f); await refresh(); }, [refresh]);
  const deleteIncome = useCallback(async (id: string) => { await db.deleteIncome(id); await refresh(); }, [refresh]);

  const value = useMemo<BallastData>(() => {
    const breakdown = paycheck(paycheckConfig);
    // Cash = depository/manual only; credit-card & loan balances are debt, not cash.
    const totalCash = accounts.filter(isCash).reduce((s, a) => s + (a.balance ?? 0), 0);
    const cardDebt = accounts.filter(isLiability).reduce((s, a) => s + (a.balance ?? 0), 0);
    const netWorth = totalCash - cardDebt;
    const checking = accounts.find((a) => (a.subtype ?? '').includes('checking'));
    const checkingBalance = checking?.balance ?? totalCash;
    const bills = recurring.reduce((s, b) => s + b.amount, 0);
    const variableBudget = categories.reduce((s, c) => s + c.monthlyLimit, 0);
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    // --- income + taxes from the profile (falls back to the legacy paycheck demo pre-onboarding) ---
    let monthlyNetIncome = breakdown.net;
    let tax: TaxSummary | null = null;

    if (profile) {
      const s = summarizeProfile(profile, today);
      monthlyNetIncome = s.monthlyNetIncome;
      tax = {
        w2AnnualGross: s.w2AnnualGross, annual1099Net: s.annual1099Net, estimate: s.estimate,
        annualTax: s.annualTax, overridden: s.overridden,
        targetToDate: s.targetToDate, setAside: s.setAside, gap: s.gap, nextQuarterly: s.nextQuarterly,
      };
    }

    const input = { startingBalance: checkingBalance, netMonthly: monthlyNetIncome, bills, variableBudget, savingsTransfer };
    const thisYear = String(today.getFullYear());
    const incomeThisYear = income.filter((i) => i.date.slice(0, 4) === thisYear).reduce((s, i) => s + i.amount, 0);

    return {
      loading, onboarded, profile,
      accounts, categories, spentByCategory, recurring, goals, income,
      paycheckConfig, breakdown, savingsTransfer,
      totalCash, cardDebt, netWorth, checkingBalance, monthlyNetIncome,
      projection: projectEndOfMonth(input),
      trajectory: monthTrajectory(input, recurring, daysInMonth, today.getDate()),
      daysLeft: daysLeftInMonth(today),
      projectedAnnualIncome: (tax ? tax.w2AnnualGross + tax.annual1099Net : paycheckConfig.grossAnnual + incomeThisYear),
      tax, today,
      refresh, completeOnboarding, updateProfile,
      addExpense, addAccount, updateAccountMeta, updatePaycheck, setCategoryLimit, addCategory, updateCategory, deleteCategory,
      syncBank, linkBank, restartOnboarding,
      addRecurring, updateRecurring, deleteRecurring, addGoal, updateGoal, deleteGoal, addIncome, deleteIncome,
    };
  }, [loading, onboarded, profile, accounts, categories, spentByCategory, recurring, goals, income, paycheckConfig, savingsTransfer,
      refresh, completeOnboarding, updateProfile, addExpense, addAccount, updateAccountMeta, updatePaycheck, setCategoryLimit,
      addCategory, updateCategory, deleteCategory, syncBank, linkBank, restartOnboarding,
      addRecurring, updateRecurring, deleteRecurring, addGoal, updateGoal, deleteGoal, addIncome, deleteIncome]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): BallastData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
