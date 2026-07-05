// EXPO_PUBLIC_* env vars are read at build time from app/.env.
// Fail loudly on missing/placeholder values — a silent 'change-me' key would
// "work" against a misconfigured server and hide the problem.
const url = process.env.EXPO_PUBLIC_API_URL;
const key = process.env.EXPO_PUBLIC_API_KEY;

if (!url) {
  throw new Error('EXPO_PUBLIC_API_URL is not set — copy app/.env.example to app/.env and fill it in.');
}
if (!key || key.startsWith('change-me')) {
  throw new Error(
    'EXPO_PUBLIC_API_KEY is missing or still the placeholder — set it in app/.env to the same value as API_KEY in server/.env.'
  );
}

export const API_BASE_URL = url;
export const API_KEY = key;

// Single-user personal app: one stable id is enough. (Plaid ties Items to this.)
export const CLIENT_USER_ID = 'ballast-user';
