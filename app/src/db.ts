import * as SQLite from 'expo-sqlite';
import type { Account } from './types';
import type { PaycheckConfig, Recurring } from './logic/finance';
import type { Filing } from './logic/tax';
import { categoryPalette } from './theme';

// Local, on-device store. Manual and Plaid-synced accounts live in one table,
// distinguished by `source`, so the rest of the app treats them identically.
// All tables use CREATE IF NOT EXISTS + seed-if-empty, so upgrading the app
// never touches existing data (e.g. the linked Plaid accounts).
// Cache the init PROMISE (not the resolved handle) so concurrent first-callers
// — e.g. the ~10 parallel reads in DataContext.refresh() — all await ONE
// open+seed instead of each racing to seed (which collided on income.id).
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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

/** The user's real setup, captured in onboarding. Drives income + tax estimates. */
export interface Profile {
  filingStatus: Filing;
  state: string;                    // 2-letter or 'none'
  stateRatePct: number;             // approximate flat state income-tax rate
  hasW2: boolean;
  w2MonthlyGross: number;           // gross monthly W2 pay before tax
  w2StartMonth: number;             // 1–12: month the W2 income started this year
  has1099: boolean;
  income1099YTD: number;            // 1099 income received so far this year
  income1099MonthlyOngoing: number; // ongoing monthly 1099 going forward (0 if none)
  taxSetAside: number;              // amount already reserved for taxes
  payCadence: 'quarterly' | 'at_filing';
  taxOverride: number | null;       // if set, use as the annual 1099 tax instead of the estimate
}

export type IncomeKind = 'bonus' | '1099' | 'other';

export interface Income {
  id: string;
  kind: IncomeKind;
  label: string;
  amount: number;
  date: string; // ISO yyyy-mm-dd
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) _dbPromise = openAndInit();
  return _dbPromise;
}

async function openAndInit(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('ballast.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT,
      subtype     TEXT,
      mask        TEXT,
      balance     REAL,
      institution TEXT,
      source      TEXT NOT NULL DEFAULT 'manual',
      nickname    TEXT,
      color       TEXT
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
    CREATE TABLE IF NOT EXISTS income (
      id     TEXT PRIMARY KEY NOT NULL,
      kind   TEXT NOT NULL,
      label  TEXT NOT NULL,
      amount REAL NOT NULL,
      date   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  // Migrate older installs whose accounts table predates nickname/color.
  await addColumnIfMissing(db, 'accounts', 'nickname', 'TEXT');
  await addColumnIfMissing(db, 'accounts', 'color', 'TEXT');
  await seedIfEmpty(db);
  return db;
}

async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, col: string, type: string) {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`);
  } catch {
    // column already exists — SQLite throws "duplicate column name"; safe to ignore
  }
}

// Starter data so the app is alive on first run — every row is editable/replaceable.
async function seedIfEmpty(db: SQLite.SQLiteDatabase) {
  // Once the user has completed onboarding they manage their own data — never
  // re-seed demo rows (this is what makes onboarding's "wipe" stick).
  const ob = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='onboarded';");
  if (ob?.value === 'true') return;

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
  const incCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM income;');
  if ((incCount?.n ?? 0) === 0) {
    const yr = new Date().getFullYear();
    const incomes: Array<[IncomeKind, string, number, string]> = [
      ['bonus', 'Q1 bonus', 6000, `${yr}-03-15`],
      ['1099', '1099 side income', 4200, `${yr}-06-01`],
    ];
    for (const [kind, label, amount, date] of incomes) {
      await db.runAsync('INSERT INTO income (id,kind,label,amount,date) VALUES (?,?,?,?,?);', [
        `inc-${kind}-${date}`, kind, label, amount, date,
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

/** User-owned display metadata; deliberately NOT touched by upsertAccounts (Plaid sync),
 *  so a nickname/color survives every re-sync. */
export async function updateAccountMeta(id: string, f: { nickname: string | null; color: string | null }) {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET nickname=?, color=? WHERE id=?;', [f.nickname, f.color, id]);
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

export async function addCategory(name: string, monthlyLimit: number) {
  const db = await getDb();
  const maxSort = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) m FROM categories;');
  await db.runAsync('INSERT INTO categories (id,name,monthlyLimit,sort) VALUES (?,?,?,?);', [
    `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, monthlyLimit, (maxSort?.m ?? -1) + 1,
  ]);
}

export async function updateCategory(id: string, f: { name: string; monthlyLimit: number }) {
  const db = await getDb();
  await db.runAsync('UPDATE categories SET name=?, monthlyLimit=? WHERE id=?;', [f.name, f.monthlyLimit, id]);
}

/** Deleting an envelope also removes its transactions (they'd be orphaned). */
export async function deleteCategory(id: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM txns WHERE categoryId=?;', [id]);
    await db.runAsync('DELETE FROM categories WHERE id=?;', [id]);
  });
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

// ---------- recurring bills (CRUD) ----------
export async function getRecurring(): Promise<Recurring[]> {
  const db = await getDb();
  return db.getAllAsync<Recurring>('SELECT * FROM recurring ORDER BY dayOfMonth;');
}

export async function addRecurring(name: string, category: string, amount: number, dayOfMonth: number) {
  const db = await getDb();
  await db.runAsync('INSERT INTO recurring (id,name,category,amount,dayOfMonth) VALUES (?,?,?,?,?);', [
    `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, category, amount, dayOfMonth,
  ]);
}

export async function updateRecurring(id: string, f: { name: string; category: string; amount: number; dayOfMonth: number }) {
  const db = await getDb();
  await db.runAsync('UPDATE recurring SET name=?, category=?, amount=?, dayOfMonth=? WHERE id=?;', [
    f.name, f.category, f.amount, f.dayOfMonth, id,
  ]);
}

export async function deleteRecurring(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM recurring WHERE id=?;', [id]);
}

// ---------- goals (CRUD) ----------
export async function getGoals(): Promise<Goal[]> {
  const db = await getDb();
  return db.getAllAsync<Goal>('SELECT * FROM goals;');
}

export async function addGoal(f: { name: string; target: number; current: number; monthly: number; color: string }) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO goals (id,name,target,current,monthly,color,kind) VALUES (?,?,?,?,?,?,'goal');",
    [`goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, f.name, f.target, f.current, f.monthly, f.color]
  );
}

export async function updateGoal(id: string, f: { name: string; target: number; current: number; monthly: number }) {
  const db = await getDb();
  await db.runAsync('UPDATE goals SET name=?, target=?, current=?, monthly=? WHERE id=?;', [
    f.name, f.target, f.current, f.monthly, id,
  ]);
}

export async function deleteGoal(id: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM goals WHERE id=? AND kind='goal';", [id]); // never delete the 401(k) row
}

// ---------- income (bonuses / 1099 / other) ----------
export async function getIncome(): Promise<Income[]> {
  const db = await getDb();
  return db.getAllAsync<Income>('SELECT * FROM income ORDER BY date DESC;');
}

export async function addIncome(f: { kind: IncomeKind; label: string; amount: number; date: string }) {
  const db = await getDb();
  await db.runAsync('INSERT INTO income (id,kind,label,amount,date) VALUES (?,?,?,?,?);', [
    `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, f.kind, f.label, f.amount, f.date,
  ]);
}

export async function deleteIncome(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM income WHERE id=?;', [id]);
}

export async function getPaycheckConfig(): Promise<PaycheckConfig> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='paycheck';");
  return row ? (JSON.parse(row.value) as PaycheckConfig) : { grossAnnual: 98000, contribPct: 8, matchPct: 4, taxPct: 26 };
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

// ---------- profile / onboarding ----------
async function putSetting(key: string, value: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value;',
    [key, value]
  );
}

export async function isOnboarded(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='onboarded';");
  return row?.value === 'true';
}

export async function setOnboarded(v: boolean) {
  await putSetting('onboarded', v ? 'true' : 'false');
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='profile';");
  return row ? (JSON.parse(row.value) as Profile) : null;
}

export async function setProfile(p: Profile) {
  await putSetting('profile', JSON.stringify(p));
}

/** Clear all user-facing demo data. Called when onboarding finishes. */
export async function wipeDemoData() {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM categories;
    DELETE FROM txns;
    DELETE FROM recurring;
    DELETE FROM goals;
    DELETE FROM income;
    DELETE FROM accounts;
    UPDATE settings SET value='0' WHERE key='savingsTransfer';
  `);
}
