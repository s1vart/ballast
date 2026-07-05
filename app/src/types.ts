export type AccountSource = 'manual' | 'plaid';

export interface Account {
  id: string;
  name: string;
  type?: string | null;
  subtype?: string | null;
  mask?: string | null;
  balance: number | null;
  institution?: string | null;
  source: AccountSource;
}

// What the backend /accounts endpoint returns for Plaid-linked accounts.
export type PlaidAccount = Account & { item_id: string; available: number | null };
