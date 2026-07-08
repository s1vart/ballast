import type { Category } from '../db';

// Plaid personal-finance-category (primary) -> envelope-name keywords to look for.
const PFC_KEYWORDS: Record<string, string[]> = {
  FOOD_AND_DRINK: ['dining', 'food', 'restaurant', 'eat'],
  GENERAL_MERCHANDISE: ['shopping', 'shop', 'merchandise', 'goods', 'amazon'],
  TRANSPORTATION: ['transport', 'gas', 'fuel', 'transit', 'car', 'commute', 'rideshare'],
  TRAVEL: ['travel', 'flight', 'hotel', 'transport'],
  ENTERTAINMENT: ['entertainment', 'fun', 'streaming', 'games'],
  PERSONAL_CARE: ['health', 'personal', 'care', 'beauty', 'gym', 'fitness'],
  MEDICAL: ['health', 'medical', 'doctor', 'pharmacy'],
  RENT_AND_UTILITIES: ['utilities', 'rent', 'bills', 'housing'],
  HOME_IMPROVEMENT: ['home', 'shopping'],
  GENERAL_SERVICES: ['services'],
  GOVERNMENT_AND_NON_PROFIT: ['charity', 'donation'],
};

// Detailed overrides where the primary is ambiguous (groceries vs. eating out).
const DETAILED_KEYWORDS: Record<string, string[]> = {
  FOOD_AND_DRINK_GROCERIES: ['grocer', 'groceries', 'food'],
  FOOD_AND_DRINK_RESTAURANT: ['dining', 'restaurant', 'eat', 'food'],
  FOOD_AND_DRINK_FAST_FOOD: ['dining', 'fast food', 'food'],
  FOOD_AND_DRINK_COFFEE: ['dining', 'coffee', 'food'],
};

// Categories that aren't discretionary spending — never fill an envelope.
const NON_SPEND_PFC = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES']);

/** True if this transaction is spending that should count toward an envelope.
 *  Plaid amount sign: positive = money OUT. */
export function isSpend(pfc: string | null, amount: number): boolean {
  if (amount <= 0) return false; // inflow / refund / payment
  if (pfc && NON_SPEND_PFC.has(pfc)) return false;
  return true;
}

/** Best-guess envelope id for a transaction, matching Plaid's category against
 *  the user's envelope NAMES so it works with whatever envelopes they've made.
 *  Returns null when nothing matches (transaction stays "Uncategorized"). */
export function suggestEnvelope(pfc: string | null, pfcDetailed: string | null, envelopes: Category[]): string | null {
  if (pfc && NON_SPEND_PFC.has(pfc)) return null;
  const keys = (pfcDetailed && DETAILED_KEYWORDS[pfcDetailed]) || (pfc && PFC_KEYWORDS[pfc]) || [];
  if (keys.length === 0) return null;
  for (const env of envelopes) {
    const name = env.name.toLowerCase();
    if (keys.some((k) => name.includes(k))) return env.id;
  }
  return null;
}
