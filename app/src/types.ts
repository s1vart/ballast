export type AccountSource = 'manual' | 'plaid';

export interface Account {
  id: string;
  name: string;
  type?: string | null;      // Plaid: 'depository' | 'credit' | 'loan' | 'investment' | ...
  subtype?: string | null;   // 'checking' | 'savings' | 'credit card' | ...
  mask?: string | null;
  balance: number | null;    // depository: cash on hand; credit: amount OWED
  institution?: string | null;
  source: AccountSource;
  nickname?: string | null;  // user override for the display name
  color?: string | null;     // user-picked card/tile color (null = auto by issuer)
}

// What the backend /accounts endpoint returns for Plaid-linked accounts.
export type PlaidAccount = Account & { item_id: string; available: number | null };

/** A credit card / loan is a liability — its balance is money owed, not cash. */
export const isLiability = (a: Account): boolean => a.type === 'credit' || a.type === 'loan';
/** Brokerage / retirement — an asset, but NOT spendable cash. */
export const isInvestment = (a: Account): boolean => a.type === 'investment' || a.type === 'brokerage';
const RETIREMENT_RE = /ira|roth|401|403|457|pension|retirement|tsp|rrsp|sep|simple/i;
export const isRetirement = (a: Account): boolean => isInvestment(a) && RETIREMENT_RE.test(`${a.subtype ?? ''} ${a.name}`);
/** Spendable cash = depository / manual only. */
export const isCash = (a: Account): boolean => !isLiability(a) && !isInvestment(a);

/** Name to show: user nickname wins, then Plaid's name. */
export const displayName = (a: Account): string => {
  const nn = a.nickname?.trim();
  return nn && nn.length > 0 ? nn : a.name;
};
