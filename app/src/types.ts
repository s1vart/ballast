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
export const isCash = (a: Account): boolean => !isLiability(a); // depository + manual default to cash

/** Name to show: user nickname wins, then Plaid's name. */
export const displayName = (a: Account): string => {
  const nn = a.nickname?.trim();
  return nn && nn.length > 0 ? nn : a.name;
};
