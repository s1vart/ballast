// EXPO_PUBLIC_* env vars are read at build time from app/.env
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080';
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? 'change-me';

// Single-user personal app: one stable id is enough. (Plaid ties Items to this.)
export const CLIENT_USER_ID = 'ballast-user';
