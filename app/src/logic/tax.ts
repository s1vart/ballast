// US tax estimation — TAX YEAR 2026. ESTIMATES ONLY, not tax advice.
// Figures: IRS Rev. Proc. 2025-32 / Tax Foundation 2026; SE tax + SS wage base 2026.
// Pure functions, unit-testable. Update the constants each tax year.

export const TAX_YEAR = 2026;

export type Filing = 'single' | 'mfj' | 'mfs' | 'hoh';

export const FILING_LABEL: Record<Filing, string> = {
  single: 'Single',
  mfj: 'Married filing jointly',
  mfs: 'Married filing separately',
  hoh: 'Head of household',
};

interface Bracket { upTo: number; rate: number } // upTo = upper edge of taxable income; Infinity = top

// 2026 ordinary income brackets (mfs ≈ mfj/2, which equals single through the 32% edge).
const BRACKETS: Record<Filing, Bracket[]> = {
  single: [
    { upTo: 12400, rate: 0.1 }, { upTo: 50400, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 }, { upTo: 256225, rate: 0.32 }, { upTo: 640600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
  ],
  mfj: [
    { upTo: 24800, rate: 0.1 }, { upTo: 100800, rate: 0.12 }, { upTo: 211400, rate: 0.22 },
    { upTo: 403550, rate: 0.24 }, { upTo: 512450, rate: 0.32 }, { upTo: 768700, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17700, rate: 0.1 }, { upTo: 67450, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 }, { upTo: 256200, rate: 0.32 }, { upTo: 640600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
  ],
  mfs: [
    { upTo: 12400, rate: 0.1 }, { upTo: 50400, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 }, { upTo: 256225, rate: 0.32 }, { upTo: 384350, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
  ],
};

export const STD_DEDUCTION: Record<Filing, number> = { single: 16100, mfj: 32200, hoh: 24150, mfs: 16100 };

const SE = { ssRate: 0.124, medicareRate: 0.029, wageBase: 184500, netFactor: 0.9235 };
const FICA_EMPLOYEE = 0.0765; // employee share of SS+Medicare on W2 wages

/** Progressive federal income tax on a taxable-income amount. */
export function federalTax(taxable: number, filing: Filing): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of BRACKETS[filing]) {
    const slice = Math.min(taxable, b.upTo) - lower;
    if (slice > 0) tax += slice * b.rate;
    lower = b.upTo;
    if (taxable <= b.upTo) break;
  }
  return tax;
}

/** Self-employment tax on 1099 net earnings, honoring the SS wage base already used by W2 wages. */
export function selfEmploymentTax(net1099: number, w2SocialSecurityWages: number): number {
  const netSE = Math.max(0, net1099) * SE.netFactor;
  const ssRoom = Math.max(0, SE.wageBase - Math.max(0, w2SocialSecurityWages));
  const ssTaxable = Math.min(netSE, ssRoom);
  return ssTaxable * SE.ssRate + netSE * SE.medicareRate;
}

export interface TaxEstimateInput {
  filing: Filing;
  w2AnnualGross: number;   // full-year W2 gross (0 if none)
  annual1099Net: number;   // full-year 1099 income, net of business expenses
  stateRatePct: number;    // approximate flat state income-tax rate (0 for no-tax states)
}

export interface TaxEstimate {
  seTax: number;           // self-employment tax on the 1099
  federalOn1099: number;   // incremental federal income tax the 1099 adds (stacked on W2)
  stateOn1099: number;     // approximate state tax on the 1099
  total: number;           // annual amount to set aside for the 1099
  effectiveRate: number;   // total / annual1099Net (0..1)
}

/**
 * How much to set aside from 1099 income. W2 wages are assumed to be roughly
 * covered by payroll withholding, so this isolates the *extra* tax the untaxed
 * 1099 income creates: SE tax + the marginal federal income tax it stacks on top
 * of W2 income + an approximate flat state tax.
 */
export function estimate1099Tax(i: TaxEstimateInput): TaxEstimate {
  const net1099 = Math.max(0, i.annual1099Net);
  const seTax = selfEmploymentTax(net1099, i.w2AnnualGross);
  const seDeduction = seTax / 2; // half of SE tax is an above-the-line deduction
  const std = STD_DEDUCTION[i.filing];
  const tiW2Only = Math.max(0, i.w2AnnualGross - std);
  const tiWithBoth = Math.max(0, i.w2AnnualGross + net1099 - seDeduction - std);
  const federalOn1099 = Math.max(0, federalTax(tiWithBoth, i.filing) - federalTax(tiW2Only, i.filing));
  const stateOn1099 = net1099 * (i.stateRatePct / 100);
  const total = seTax + federalOn1099 + stateOn1099;
  return { seTax, federalOn1099, stateOn1099, total, effectiveRate: net1099 > 0 ? total / net1099 : 0 };
}

/** Approximate total annual tax withheld from W2 wages (used to net down W2 take-home). */
export function w2AnnualTax(w2Gross: number, filing: Filing, stateRatePct: number): number {
  if (w2Gross <= 0) return 0;
  const fed = federalTax(Math.max(0, w2Gross - STD_DEDUCTION[filing]), filing);
  const fica = Math.min(w2Gross, SE.wageBase) * 0.062 + w2Gross * 0.0145;
  const state = w2Gross * (stateRatePct / 100);
  return fed + fica + state;
}

// ---- Quarterly estimated-payment schedule (tax year 2026) ----
export const QUARTERLY = [
  { label: 'Q1', dueISO: '2026-04-15' },
  { label: 'Q2', dueISO: '2026-06-15' },
  { label: 'Q3', dueISO: '2026-09-15' },
  { label: 'Q4', dueISO: '2027-01-15' },
] as const;

/** Next upcoming quarterly due date on/after `today` (local time), or null if all passed. */
export function nextQuarterlyDue(today: Date): { label: string; due: Date } | null {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const q of QUARTERLY) {
    const [y, m, d] = q.dueISO.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    if (due >= t) return { label: q.label, due };
  }
  return null;
}

/** Fraction of the calendar year elapsed at `today` (0..1) — for prorating an annual target. */
export function yearElapsedFraction(today: Date): number {
  const start = new Date(today.getFullYear(), 0, 1).getTime();
  const end = new Date(today.getFullYear() + 1, 0, 1).getTime();
  return Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)));
}
