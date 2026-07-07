// Pure money math — no I/O, unit-testable.

export interface PaycheckConfig {
  grossAnnual: number;
  contribPct: number; // 401(k) employee %
  matchPct: number;   // employer match %
  taxPct: number;     // effective tax + FICA %, applied after 401(k) deferral
}

export interface PaycheckBreakdown {
  grossMonthly: number;
  contrib: number;
  match: number;
  taxes: number;
  net: number;          // monthly take-home
  annual401k: number;   // employee + match, yearly
}

export function paycheck(cfg: PaycheckConfig): PaycheckBreakdown {
  const grossMonthly = cfg.grossAnnual / 12;
  const contrib = (grossMonthly * cfg.contribPct) / 100;
  const match = (grossMonthly * cfg.matchPct) / 100;
  const taxes = (grossMonthly - contrib) * (cfg.taxPct / 100);
  const net = grossMonthly - contrib - taxes;
  return { grossMonthly, contrib, match, taxes, net, annual401k: (contrib + match) * 12 };
}

export interface Recurring {
  id: string;
  name: string;
  category: string;
  amount: number;
  dayOfMonth: number;
}

export interface ProjectionInput {
  startingBalance: number;   // checking balance today
  netMonthly: number;        // take-home
  bills: number;             // Σ recurring
  variableBudget: number;    // Σ category limits
  savingsTransfer: number;   // monthly transfer out to goals/savings
}

/** The signature calculation: where the month ends up. */
export function projectEndOfMonth(p: ProjectionInput): number {
  return p.startingBalance + p.netMonthly - p.bills - p.variableBudget - p.savingsTransfer;
}

export interface TrajectoryPoint {
  day: number;      // 1..daysInMonth
  balance: number;
}

/**
 * Daily balance trajectory for the current month (drives the Home chart).
 * Model: paycheck lands on the 15th and last day (half each); each bill hits
 * its dayOfMonth; variable spend accrues evenly; transfer leaves on the 1st.
 * `today` anchors the curve: balance(today) === startingBalance.
 */
export function monthTrajectory(
  p: ProjectionInput,
  bills: Recurring[],
  daysInMonth: number,
  today: number
): TrajectoryPoint[] {
  const dailyVariable = p.variableBudget / daysInMonth;
  const delta = (day: number): number => {
    let d = -dailyVariable;
    if (day === 1) d -= p.savingsTransfer;
    if (day === 15) d += p.netMonthly / 2;
    if (day === daysInMonth) d += p.netMonthly / 2;
    for (const b of bills) if (b.dayOfMonth === day) d -= b.amount;
    return d;
  };
  // Walk backward from today to day 1, then forward to month end.
  const balances = new Array<number>(daysInMonth + 1);
  balances[today] = p.startingBalance;
  for (let day = today - 1; day >= 1; day--) balances[day] = balances[day + 1] - delta(day + 1);
  for (let day = today + 1; day <= daysInMonth; day++) balances[day] = balances[day - 1] + delta(day);
  return Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, balance: balances[i + 1] }));
}

/** "12 days to go" etc. */
export function daysLeftInMonth(now: Date): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate();
}
