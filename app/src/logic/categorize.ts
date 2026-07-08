import type { Category } from '../db';

// Plaid personal-finance-category (primary) -> envelope-name keywords to look for.
const PFC_KEYWORDS: Record<string, string[]> = {
  FOOD_AND_DRINK: ['dining', 'food', 'restaurant', 'eat', 'drink'],
  GENERAL_MERCHANDISE: ['shopping', 'shop', 'merchandise', 'goods', 'amazon'],
  HOME_IMPROVEMENT: ['home', 'shopping', 'improvement'],
  TRANSPORTATION: ['transport', 'gas', 'fuel', 'transit', 'car', 'commute', 'rideshare'],
  TRAVEL: ['travel', 'flight', 'hotel', 'airline'],
  ENTERTAINMENT: ['entertainment', 'fun', 'streaming', 'games'],
  PERSONAL_CARE: ['health', 'personal', 'care', 'beauty', 'gym', 'fitness'],
  MEDICAL: ['health', 'medical', 'doctor', 'pharmacy'],
  RENT_AND_UTILITIES: ['bills', 'utilities', 'rent', 'housing'],
  GENERAL_SERVICES: ['bills', 'services'],
  GOVERNMENT_AND_NON_PROFIT: ['charity', 'donation', 'gov'],
};

const DETAILED_KEYWORDS: Record<string, string[]> = {
  FOOD_AND_DRINK_GROCERIES: ['grocer', 'groceries', 'food'],
  FOOD_AND_DRINK_RESTAURANT: ['dining', 'restaurant', 'eat', 'food'],
  FOOD_AND_DRINK_FAST_FOOD: ['dining', 'fast food', 'food'],
  FOOD_AND_DRINK_COFFEE: ['dining', 'coffee', 'food'],
};

// Not discretionary spending — never fill an envelope, and shown as their own thing.
const NON_SPEND_PFC = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES']);
// The subset that are money movement between your own accounts / card payoffs.
const TRANSFER_PFC = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS']);

export const isTransfer = (pfc: string | null): boolean => !!pfc && TRANSFER_PFC.has(pfc);
export const isSpendPfc = (pfc: string | null): boolean => !(pfc && NON_SPEND_PFC.has(pfc));

/** True if this transaction is spending that should count toward an envelope. */
export function isSpend(pfc: string | null, amount: number): boolean {
  return amount > 0 && isSpendPfc(pfc);
}

// Human-readable label for a Plaid category (shown on every transaction).
const PFC_LABEL: Record<string, string> = {
  FOOD_AND_DRINK: 'Food & Drink',
  GENERAL_MERCHANDISE: 'Shopping',
  HOME_IMPROVEMENT: 'Home',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  ENTERTAINMENT: 'Entertainment',
  PERSONAL_CARE: 'Personal Care',
  MEDICAL: 'Medical',
  RENT_AND_UTILITIES: 'Bills & Utilities',
  GENERAL_SERVICES: 'Services',
  GOVERNMENT_AND_NON_PROFIT: 'Gov / Charity',
  LOAN_PAYMENTS: 'Card Payment',
  TRANSFER_IN: 'Transfer In',
  TRANSFER_OUT: 'Transfer',
  INCOME: 'Income',
  BANK_FEES: 'Fees',
};
const DETAILED_LABEL: Record<string, string> = {
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  FOOD_AND_DRINK_RESTAURANT: 'Dining',
  FOOD_AND_DRINK_FAST_FOOD: 'Dining',
  FOOD_AND_DRINK_COFFEE: 'Coffee',
};
export function humanizeCategory(pfc: string | null, detailed: string | null): string {
  return (detailed && DETAILED_LABEL[detailed]) || (pfc && PFC_LABEL[pfc]) || 'Other';
}

/** Standard "normal credit-card" envelopes, seeded when the user has none so
 *  transactions land somewhere and the budget rings work out of the box. */
export const STANDARD_ENVELOPES: Array<{ id: string; name: string; monthlyLimit: number }> = [
  { id: 'groceries', name: 'Groceries', monthlyLimit: 600 },
  { id: 'dining', name: 'Dining & Drinks', monthlyLimit: 300 },
  { id: 'transport', name: 'Transportation', monthlyLimit: 250 },
  { id: 'travel', name: 'Travel', monthlyLimit: 200 },
  { id: 'shopping', name: 'Shopping', monthlyLimit: 300 },
  { id: 'entertainment', name: 'Entertainment', monthlyLimit: 150 },
  { id: 'health', name: 'Health & Personal', monthlyLimit: 150 },
  { id: 'bills', name: 'Bills & Utilities', monthlyLimit: 400 },
  { id: 'other', name: 'Other', monthlyLimit: 200 },
];

/** Suggest an envelope id, matching Plaid's category against the user's envelope
 *  NAMES; spend that matches nothing falls back to an "Other" envelope so it's
 *  never left uncategorized. Transfers/income return null (not budgeted). */
export function suggestEnvelope(pfc: string | null, pfcDetailed: string | null, envelopes: Category[]): string | null {
  if (!isSpendPfc(pfc)) return null;
  const keys = (pfcDetailed && DETAILED_KEYWORDS[pfcDetailed]) || (pfc && PFC_KEYWORDS[pfc]) || [];
  for (const env of envelopes) {
    const name = env.name.toLowerCase();
    if (keys.some((k) => name.includes(k))) return env.id;
  }
  const other = envelopes.find((e) => /other|misc|general/i.test(e.name));
  return other?.id ?? null;
}
