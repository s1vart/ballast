import { API_BASE_URL, API_KEY } from './config';
import type { PlaidAccount } from './types';

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export const getLinkToken = (userId: string): Promise<string> =>
  req('/link/token', { method: 'POST', body: JSON.stringify({ userId }) }).then((r) => r.link_token);

export const exchangePublicToken = (
  public_token: string
): Promise<{ item_id: string; institution: string | null }> =>
  req('/item/exchange', { method: 'POST', body: JSON.stringify({ public_token }) });

export const fetchPlaidAccounts = (): Promise<PlaidAccount[]> =>
  req('/accounts').then((r) => r.accounts);
