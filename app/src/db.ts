import * as SQLite from 'expo-sqlite';
import type { Account } from './types';
import type { PaycheckConfig, Recurring } from './logic/finance';
import { categoryPalette } from './theme';

// Local, on-device store. Manual and Plaid-synced accounts live in one table,
// distinguished by `source`, so the rest of the app treats them identically.
// All tables use CREATE IF NOT EXISTS + seed-if-empty, so upgrading the app
// never touches existing data (e.g. the linked Plaid accounts).
let _db: SQLite.SQLiteDatabase | null = null;

export interface Category {
  id: string;
  name: string;
  monthlyLimit: number;
  sort: number;
}

export interface Txn {
  id: string;
  categoryId: string;
  amount: number;
  note: string | null;
  date: string; // ISO yyyy-mm-dd
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  monthly: number;
  color: string;
  kind: 'goal' | 'retirement';
}

export async function getDb() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('ballast.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT,
      subtype     TEXT,
      mask        TEXT,
      balance     REAL,
      institution TEXT,
      source      TEXT NOT NULL DEFAULT 'manual'
    );
    CREATE TABLE IF NOT EXISTS categories (
      id           TEXT PRIMARY KEY NOT NULL,
      name         TEXT NOT NULL,
      monthlyLimit REAL NOT NULL,
      sort         INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS txns (
      id         TEXT PRIMARY KEY NOT NULL,
      categoryId TEXT NOT NULL,
      amount     REAL NOT NULL,
      note       TEXT,
      date       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recurring (
      id         TEXT PRIMARY KEY NOT NULL,
      name       TEXT NOT NULL,
      category   TEXT NOT NULL,
      amount     REAL NOT NULL,
      dayOfMonth INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id      TEXT PRIMARY KEY NOT NULL,
      name    TEXT NOT NULL,
      target  REAL NOT NULL,
      current REAL NOT NULL,
      monthly REAL NOT NULL,
      color   TEXT NOT NULL,
      kind    TEXT NOT NULL DEFAULT 'goal'
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  await seedIfEmpty(_db);
  return _db;
}

// Starter data so the app is alive on first run — every row is editable/replaceable.
async function seedIfEmpty(db: SQLite.SQLiteDatabase) {
  const catCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM categories;');
  if ((catCount?.n ?? 0) === 0) {
    const cats: Array<[string, string, number, number]> = [
      ['groceries', 'Groceries', 600, 0],
      ['dining', 'Dining out', 300, 1],
      ['transport', 'Transportation', 200, 2],
      ['shopping', 'Shopping', 250, 3],
      ['entertainment', 'Entertainment', 150, 4],
      ['health', 'Health/Personal', 120, 5],
    ];
    for (const [id, name, limit, sort] of cats) {
      await db.runAsync('INSERT INTO categories (id,name,monthlyLimit,sort) VALUES (?,?,?,?);', [id, name, limit, sort]);
    }
  }
  const recCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM recurring;');
  if ((recCount?.n ?? 0) === 0) {
    const bills: Array<[string, string, number, number]> = [
      ['Rent', 'Housing', 1850, 1],
      ['Car insurance', 'Auto', 142, 5],
      ['Internet', 'Utilities', 70, 8],
      ['Phone', 'Utilities', 60, 12],
      ['Electric', 'Utilities', 95, 15],
      ['Gym', 'Health', 45, 18],
      ['Spotify Duo', 'Subscriptions', 17, 20],
      ['Netflix', 'Subscriptions', 16, 22],
      ['Renters insurance', 'Housing', 14, 25],
    ];
    for (const [name, category, amount, day] of bills) {
      await db.runAsync('INSERT INTO recurring (id,name,category,amount,dayOfMonth) VALUES (?,?,?,?,?);', [
        `rec-${name.toLowerCase().replace(/\W+/g, '-')}`, name, category, amount, day,
      ]);
    }
  }
  const goalCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM goals;');
  if ((goalCount?.n ?? 0) === 0) {
    const gs: Array<[string, string, number, number, number, string, string]> = [
      ['emergency', 'Emergency Fund', 25000, 18540, 400, '#1C8C55', 'goal'],
      ['house', 'House Down Payment', 60000, 12300, 900, '#2D6FB8', 'goal'],
      ['roth', 'Roth IRA 2026', 7000, 3250, 300, '#7F77DD', 'goal'],
      ['k401', '401(k)', 0, 41200, 0, '#0F6E42', 'retirement'],
    ];
    for (const [id, name, target, current, monthly, color, kind] of gs) {
      await db.runAsync('INSERT INTO goals (id,name,target,current,monthly,color,kind) VALUES (?,?,?,?,?,?,?);', [
        id, name, target, current, monthly, color, kind,
      ]);
    }
  }
  const pc = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='paycheck';");
  if (!pc) {
    const defaults: PaycheckConfig = { grossAnnual: 98000, contribPct: 8, matchPct: 4, taxPct: 26 };
    await db.runAsync("INSERT INTO settings (key,value) VALUES ('paycheck',?);", [JSON.stringify(defaults)]);
    await db.runAsync("INSERT INTO settings (key,value) VALUES ('savingsTransfer','800');", []);
  }
}

// ---------- accounts (unchanged API) ----------
export async function getAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY source DESC, name ASC;');
}

export async function upsertAccounts(accounts: Account[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const a of accounts) {
      await db.runAsync(
        `INSERT INTO accounts (id, name, type, subtype, mask, balance, institution, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, type=excluded.type, subtype=excluded.subtype,
           mask=excluded.mask, balance=excluded.balance,
           institution=excluded.institution, source=excluded.source;`,
        [a.id, a.name, a.type ?? null, a.subtype ?? null, a.mask ?? null, a.balance ?? null, a.institution ?? null, a.source]
      );
    }
  });
}

export async function addManualAccount(name: string, balance: number) {
  const db = await getDb();
  await db.runAsync(`INSERT INTO accounts (id, name, balance, source) VALUES (?, ?, ?, 'manual');`, [
    `manual-${Date.now()}`, name, balance,
  ]);
}

// ---------- categories / txns ----------
export async function getCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY sort;');
}

export async function setCategoryLimit(id: string, monthlyLimit: number) {
  const db = await getDb();
  await db.runAsync('UPDATE categories SET monthlyLimit=? WHERE id=?;', [monthlyLimit, id]);
}

export async function addTxn(categoryId: string, amount: number, note?: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO txns (id,categoryId,amount,note,date) VALUES (?,?,?,?,date());', [
    `txn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, categoryId, amount, note ?? null,
  ]);
}

/** Spent per category for the current month. */
export async function getMonthSpend(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ categoryId: string; total: number }>(
    `SELECT categoryId, SUM(amount) total FROM txns
     WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now') GROUP BY categoryId;`
  );
  return Object.fromEntries(rows.map((r) => [r.categoryId, r.total]));
}

export async function getRecentTxns(limit = 20): Promise<Txn[]> {
  const db = await getDb();
  return db.getAllAsync<Txn>('SELECT * FROM txns ORDER BY date DESC, id DESC LIMIT ?;', [limit]);
}

// ---------- recurring / goals / settings ----------
export async function getRecurring(): Promise<Recurring[]> {
  const db = await getDb();
  return db.getAllAsync<Recurring>('SELECT * FROM recurring ORDER BY dayOfMonth;');
}

export async function getGoals(): Promise<Goal[]> {
  const db = await getDb();
  return db.getAllAsync<Goal>('SELECT * FROM goals;');
}

export async function getPaycheckConfig(): Promise<PaycheckConfig> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='paycheck';");
  return JSON.parse(row!.value) as PaycheckConfig;
}

export async function setPaycheckConfig(cfg: PaycheckConfig) {
  const db = await getDb();
  await db.runAsync("UPDATE settings SET value=? WHERE key='paycheck';", [JSON.stringify(cfg)]);
}

export async function getSavingsTransfer(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='savingsTransfer';");
  return Number(row?.value ?? 0);
}

export const categoryColor = (id: string) =>
  categoryPalette[id] ?? { c: '#5A51C8', track: '#EEEDFE', tx: '#3C3489' };
