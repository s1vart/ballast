import type { Profile } from '../db';
import { estimate1099Tax, w2AnnualTax, nextQuarterlyDue, TaxEstimate } from './tax';

export interface ProfileSummary {
  w2AnnualGross: number;
  annual1099Net: number;
  estimate: TaxEstimate;
  annualTax: number;        // estimate.total, or the user's override
  overridden: boolean;
  effectiveRate: number;    // annualTax / annual1099Net
  w2NetMonthly: number;
  oneNetMonthly: number;    // ongoing 1099 per month, net of its tax set-aside
  monthlyNetIncome: number; // spendable per month (feeds the projection)
  targetToDate: number;     // how much should be set aside by now
  setAside: number;
  gap: number;              // setAside - targetToDate (+ ahead / - behind)
  nextQuarterly: { label: string; due: Date } | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Single source of truth: turn a Profile + today into income & tax numbers.
 *  Used by both the live app (DataContext) and the onboarding preview. */
export function summarizeProfile(p: Profile, today: Date): ProfileSummary {
  const currentMonth = today.getMonth() + 1;
  const monthsW2 = p.hasW2 ? clamp(13 - p.w2StartMonth, 0, 12) : 0;
  const w2AnnualGross = p.hasW2 ? p.w2MonthlyGross * monthsW2 : 0;
  const annual1099Net = p.has1099
    ? p.income1099YTD + p.income1099MonthlyOngoing * Math.max(0, 12 - currentMonth)
    : 0;

  const estimate = estimate1099Tax({ filing: p.filingStatus, w2AnnualGross, annual1099Net, stateRatePct: p.stateRatePct });
  const annualTax = p.taxOverride != null ? p.taxOverride : estimate.total;
  const effectiveRate = annual1099Net > 0 ? annualTax / annual1099Net : 0;

  const w2NetMonthly = p.hasW2 && w2AnnualGross > 0
    ? p.w2MonthlyGross * (1 - w2AnnualTax(w2AnnualGross, p.filingStatus, p.stateRatePct) / w2AnnualGross)
    : 0;
  const oneNetMonthly = p.has1099 ? p.income1099MonthlyOngoing * (1 - effectiveRate) : 0;
  const monthlyNetIncome = w2NetMonthly + oneNetMonthly;

  const ytdShare = annual1099Net > 0 ? clamp(p.income1099YTD / annual1099Net, 0, 1) : 0;
  const targetToDate = annualTax * ytdShare;

  return {
    w2AnnualGross, annual1099Net, estimate, annualTax, overridden: p.taxOverride != null, effectiveRate,
    w2NetMonthly, oneNetMonthly, monthlyNetIncome, targetToDate,
    setAside: p.taxSetAside, gap: p.taxSetAside - targetToDate, nextQuarterly: nextQuarterlyDue(today),
  };
}
