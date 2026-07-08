// State income tax lookup — TAX YEAR 2026. Approximations for planning, not tax advice.
// Source: Tax Foundation, 2026 state individual income tax rates (verified 2026-07).
//
// `rate` is the approximate MARGINAL rate that applies to additional (1099) income
// for a mid-income earner (~$75–150k single):
//  - no-tax states: 0
//  - flat states: the flat rate
//  - graduated states: the top rate when its bracket starts low (most do), otherwise
//    the marginal rate of the mid-income bracket (e.g. CA 9.3, NY 6.0).
// Progressive states are labeled 'approx' in the UI and the rate stays user-adjustable.

export type StateKind = 'none' | 'flat' | 'graduated';

export interface StateInfo {
  code: string;
  name: string;
  rate: number;
  kind: StateKind;
}

export const STATES: StateInfo[] = [
  { code: 'AL', name: 'Alabama', rate: 5.0, kind: 'graduated' },
  { code: 'AK', name: 'Alaska', rate: 0, kind: 'none' },
  { code: 'AZ', name: 'Arizona', rate: 2.5, kind: 'flat' },
  { code: 'AR', name: 'Arkansas', rate: 3.9, kind: 'graduated' },
  { code: 'CA', name: 'California', rate: 9.3, kind: 'graduated' },
  { code: 'CO', name: 'Colorado', rate: 4.4, kind: 'flat' },
  { code: 'CT', name: 'Connecticut', rate: 5.5, kind: 'graduated' },
  { code: 'DE', name: 'Delaware', rate: 6.6, kind: 'graduated' },
  { code: 'DC', name: 'District of Columbia', rate: 8.5, kind: 'graduated' },
  { code: 'FL', name: 'Florida', rate: 0, kind: 'none' },
  { code: 'GA', name: 'Georgia', rate: 5.19, kind: 'flat' },
  { code: 'HI', name: 'Hawaii', rate: 8.25, kind: 'graduated' },
  { code: 'ID', name: 'Idaho', rate: 5.3, kind: 'flat' },
  { code: 'IL', name: 'Illinois', rate: 4.95, kind: 'flat' },
  { code: 'IN', name: 'Indiana', rate: 2.95, kind: 'flat' },
  { code: 'IA', name: 'Iowa', rate: 3.8, kind: 'flat' },
  { code: 'KS', name: 'Kansas', rate: 5.58, kind: 'graduated' },
  { code: 'KY', name: 'Kentucky', rate: 3.5, kind: 'flat' },
  { code: 'LA', name: 'Louisiana', rate: 3.0, kind: 'flat' },
  { code: 'ME', name: 'Maine', rate: 7.15, kind: 'graduated' },
  { code: 'MD', name: 'Maryland', rate: 4.75, kind: 'graduated' }, // + county tax, not modeled
  { code: 'MA', name: 'Massachusetts', rate: 5.0, kind: 'graduated' },
  { code: 'MI', name: 'Michigan', rate: 4.25, kind: 'flat' },
  { code: 'MN', name: 'Minnesota', rate: 6.8, kind: 'graduated' },
  { code: 'MS', name: 'Mississippi', rate: 4.0, kind: 'flat' },
  { code: 'MO', name: 'Missouri', rate: 4.7, kind: 'graduated' },
  { code: 'MT', name: 'Montana', rate: 5.65, kind: 'graduated' },
  { code: 'NE', name: 'Nebraska', rate: 4.55, kind: 'graduated' },
  { code: 'NV', name: 'Nevada', rate: 0, kind: 'none' },
  { code: 'NH', name: 'New Hampshire', rate: 0, kind: 'none' },
  { code: 'NJ', name: 'New Jersey', rate: 6.37, kind: 'graduated' },
  { code: 'NM', name: 'New Mexico', rate: 4.9, kind: 'graduated' },
  { code: 'NY', name: 'New York', rate: 6.0, kind: 'graduated' },
  { code: 'NC', name: 'North Carolina', rate: 3.99, kind: 'flat' },
  { code: 'ND', name: 'North Dakota', rate: 1.95, kind: 'graduated' },
  { code: 'OH', name: 'Ohio', rate: 2.75, kind: 'flat' },
  { code: 'OK', name: 'Oklahoma', rate: 4.5, kind: 'graduated' },
  { code: 'OR', name: 'Oregon', rate: 8.75, kind: 'graduated' },
  { code: 'PA', name: 'Pennsylvania', rate: 3.07, kind: 'flat' },
  { code: 'RI', name: 'Rhode Island', rate: 4.75, kind: 'graduated' },
  { code: 'SC', name: 'South Carolina', rate: 6.0, kind: 'graduated' },
  { code: 'SD', name: 'South Dakota', rate: 0, kind: 'none' },
  { code: 'TN', name: 'Tennessee', rate: 0, kind: 'none' },
  { code: 'TX', name: 'Texas', rate: 0, kind: 'none' },
  { code: 'UT', name: 'Utah', rate: 4.5, kind: 'flat' },
  { code: 'VT', name: 'Vermont', rate: 6.6, kind: 'graduated' },
  { code: 'VA', name: 'Virginia', rate: 5.75, kind: 'graduated' },
  { code: 'WA', name: 'Washington', rate: 0, kind: 'none' }, // taxes capital gains only
  { code: 'WV', name: 'West Virginia', rate: 4.82, kind: 'graduated' },
  { code: 'WI', name: 'Wisconsin', rate: 5.3, kind: 'graduated' },
  { code: 'WY', name: 'Wyoming', rate: 0, kind: 'none' },
];

export const stateByCode = (code: string): StateInfo | undefined =>
  STATES.find((s) => s.code === code.toUpperCase());

/** Short human label for a state's tax situation, e.g. "no income tax" / "flat 4.95%" / "≈6.0%". */
export function stateRateLabel(s: StateInfo): string {
  if (s.kind === 'none') return 'no income tax';
  if (s.kind === 'flat') return `flat ${s.rate}%`;
  return `≈${s.rate}%`;
}
