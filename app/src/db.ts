import * as SQLite from 'expo-sqlite';
import type { Account } from './types';
import type { PaycheckConfig, Recurring } from './logic/finance';
import type { Filing } from './logic/tax';
import { categoryPalette } from './theme';
import { suggestEnvelope, isSpendPfc, STANDARD_ENVELOPES } from './logic/categorize';

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
  color: string | null; // user-picked; falls back to an auto color when null
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
  current: number;          // manual fallback; overridden by the linked account balance
  monthly: number;          // manual fallback; overridden by the detected recurring transfer
  color: string;
  kind: 'goal' | 'retirement';
  accountId: string | null;       // when set, progress tracks this account's live balance
  contributionKey: string | null; // when set, monthly = the detected recurring transfer's amount
  targetDate: string | null;      // when set (YYYY-MM-01), monthly = amount needed to hit target by then
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
      sort         INTEGER NOT NULL DEFAULT 0,
      color        TEXT
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
      kind    TEXT NOT NULL DEFAULT 'goal',
      accountId       TEXT,
      contributionKey TEXT,
      targetDate      TEXT
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
    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY NOT NULL,
      accountId   TEXT,
      name        TEXT,
      merchant    TEXT,
      amount      REAL,
      date        TEXT,
      pending     INTEGER NOT NULL DEFAULT 0,
      pendingTxId TEXT,
      pfc         TEXT,
      pfcDetailed TEXT,
      envelopeId  TEXT,
      excluded    INTEGER NOT NULL DEFAULT 0,
      pinned      INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Migrate older installs whose accounts table predates nickname/color.
  await addColumnIfMissing(db, 'accounts', 'nickname', 'TEXT');
  await addColumnIfMissing(db, 'accounts', 'color', 'TEXT');
  // excluded = user marked it a bill/necessity (out of discretionary spend);
  // pinned = user set its category by hand, so auto-recategorize won't touch it.
  await addColumnIfMissing(db, 'transactions', 'excluded', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'transactions', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
  // goals can link to a real account (live balance) + a recurring transfer (contribution).
  await addColumnIfMissing(db, 'goals', 'accountId', 'TEXT');
  await addColumnIfMissing(db, 'goals', 'contributionKey', 'TEXT');
  await addColumnIfMissing(db, 'categories', 'color', 'TEXT'); // user-picked envelope color (else auto)
  await addColumnIfMissing(db, 'goals', 'targetDate', 'TEXT'); // deadline mode: compute monthly from a target date
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
    // Reconcile: drop Plaid accounts no longer returned (removed items, or dupes
    // from a re-auth). Never touches manual accounts.
    const ids = accounts.map((a) => a.id);
    if (ids.length) {
      await db.runAsync(`DELETE FROM accounts WHERE source='plaid' AND id NOT IN (${ids.map(() => '?').join(',')});`, ids);
    } else {
      await db.runAsync("DELETE FROM accounts WHERE source='plaid';");
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

export async function addCategory(name: string, monthlyLimit: number, color?: string | null) {
  const db = await getDb();
  const maxSort = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) m FROM categories;');
  await db.runAsync('INSERT INTO categories (id,name,monthlyLimit,sort,color) VALUES (?,?,?,?,?);', [
    `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, monthlyLimit, (maxSort?.m ?? -1) + 1, color ?? null,
  ]);
}

export async function updateCategory(id: string, f: { name: string; monthlyLimit: number; color?: string | null }) {
  const db = await getDb();
  await db.runAsync('UPDATE categories SET name=?, monthlyLimit=?, color=COALESCE(?,color) WHERE id=?;', [f.name, f.monthlyLimit, f.color ?? null, id]);
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

export async function addGoal(f: { name: string; target: number; current: number; monthly: number; color: string; accountId?: string | null; contributionKey?: string | null; targetDate?: string | null }) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO goals (id,name,target,current,monthly,color,kind,accountId,contributionKey,targetDate) VALUES (?,?,?,?,?,?,'goal',?,?,?);",
    [`goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, f.name, f.target, f.current, f.monthly, f.color, f.accountId ?? null, f.contributionKey ?? null, f.targetDate ?? null]
  );
}

export async function updateGoal(id: string, f: { name: string; target: number; current: number; monthly: number; color?: string; accountId?: string | null; contributionKey?: string | null; targetDate?: string | null }) {
  const db = await getDb();
  await db.runAsync('UPDATE goals SET name=?, target=?, current=?, monthly=?, color=COALESCE(?,color), accountId=?, contributionKey=?, targetDate=? WHERE id=?;', [
    f.name, f.target, f.current, f.monthly, f.color ?? null, f.accountId ?? null, f.contributionKey ?? null, f.targetDate ?? null, id,
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

// ---------- synced bank transactions ----------
export interface BankTxn {
  id: string;
  accountId: string | null;
  name: string;
  merchant: string;
  amount: number;        // Plaid sign: + = spend
  date: string;
  pending: number;       // 0/1
  pendingTxId: string | null;
  pfc: string | null;
  pfcDetailed: string | null;
  envelopeId: string | null;
  excluded: number;      // 0/1 — user marked it a bill/necessity (not discretionary spend)
  pinned: number;        // 0/1 — user set the category by hand; auto-recategorize skips it
}

// Shape the server's /transactions/sync returns for each added/modified txn.
export interface RawTxn {
  id: string;
  account_id: string | null;
  name: string;
  merchant: string;
  amount: number;
  date: string;
  pending: boolean;
  pending_transaction_id: string | null;
  pfc: string | null;
  pfc_detailed: string | null;
}

/** Apply a Plaid sync delta. Handles pending→posted reconciliation: when a posted
 *  txn arrives it deletes the pending row it supersedes, so the final amount (incl.
 *  tips) replaces the pending one — never a duplicate. A user's manual envelope
 *  choice is preserved across re-syncs via COALESCE. */
/** Seed the standard "normal credit-card" envelopes once, if the user has none,
 *  so transactions have somewhere to land. Respects custom envelopes (won't seed
 *  if any exist) and never resurrects after (flag). */
export async function ensureStandardEnvelopes() {
  const db = await getDb();
  const seeded = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='stdEnvSeeded';");
  if (seeded?.value === 'true') return;
  const cnt = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM categories;');
  if ((cnt?.n ?? 0) === 0) {
    for (let i = 0; i < STANDARD_ENVELOPES.length; i++) {
      const e = STANDARD_ENVELOPES[i];
      await db.runAsync('INSERT INTO categories (id,name,monthlyLimit,sort) VALUES (?,?,?,?);', [e.id, e.name, e.monthlyLimit, i]);
    }
  }
  await putSetting('stdEnvSeeded', 'true');
}

/** Keep envelope assignments correct: fixed/transfer/income transactions are
 *  force-unassigned (they aren't discretionary spend), and budgetable spend that
 *  has no envelope gets a suggestion. Never overrides an existing spend assignment. */
export async function recategorize() {
  const db = await getDb();
  const envelopes = await getCategories();
  // pinned rows were set by the user — never auto-touch them.
  const rows = await db.getAllAsync<{ id: string; pfc: string | null; pfcDetailed: string | null; envelopeId: string | null }>(
    'SELECT id, pfc, pfcDetailed, envelopeId FROM transactions WHERE pinned=0;'
  );
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      if (!isSpendPfc(r.pfc)) {
        if (r.envelopeId !== null) await db.runAsync('UPDATE transactions SET envelopeId=NULL WHERE id=?;', [r.id]);
      } else if (r.envelopeId === null) {
        const env = suggestEnvelope(r.pfc, r.pfcDetailed, envelopes);
        if (env) await db.runAsync('UPDATE transactions SET envelopeId=? WHERE id=?;', [env, r.id]);
      }
    }
  });
}

export async function applyTxnSync(data: { added: RawTxn[]; modified: RawTxn[]; removed: string[] }) {
  const db = await getDb();
  await ensureStandardEnvelopes();
  const envelopes = await getCategories();
  await db.withTransactionAsync(async () => {
    for (const id of data.removed) {
      await db.runAsync('DELETE FROM transactions WHERE id=?;', [id]);
    }
    for (const t of [...data.added, ...data.modified]) {
      if (t.pending_transaction_id) {
        await db.runAsync('DELETE FROM transactions WHERE id=?;', [t.pending_transaction_id]);
      }
      const suggested = suggestEnvelope(t.pfc, t.pfc_detailed, envelopes);
      await db.runAsync(
        `INSERT INTO transactions (id,accountId,name,merchant,amount,date,pending,pendingTxId,pfc,pfcDetailed,envelopeId)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           accountId=excluded.accountId, name=excluded.name, merchant=excluded.merchant,
           amount=excluded.amount, date=excluded.date, pending=excluded.pending,
           pendingTxId=excluded.pendingTxId, pfc=excluded.pfc, pfcDetailed=excluded.pfcDetailed,
           envelopeId=COALESCE(transactions.envelopeId, excluded.envelopeId);`,
        [t.id, t.account_id, t.name, t.merchant, t.amount, t.date, t.pending ? 1 : 0,
         t.pending_transaction_id, t.pfc, t.pfc_detailed, suggested]
      );
    }
  });
  await recategorize();
}

export async function getBankTxns(limit = 40): Promise<BankTxn[]> {
  const db = await getDb();
  return db.getAllAsync<BankTxn>('SELECT * FROM transactions ORDER BY pending DESC, date DESC, id DESC LIMIT ?;', [limit]);
}

// User assigns a spending envelope by hand → pin it, and it's spend (not a bill).
export async function setTxnEnvelope(id: string, envelopeId: string | null) {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET envelopeId=?, excluded=0, pinned=1 WHERE id=?;', [envelopeId, id]);
}

// User marks a transaction as a bill/necessity (or unmarks it). When excluded it
// leaves every spending envelope and never counts toward discretionary spend.
export async function setTxnExcluded(id: string, excluded: boolean) {
  const db = await getDb();
  if (excluded) {
    await db.runAsync('UPDATE transactions SET excluded=1, envelopeId=NULL, pinned=1 WHERE id=?;', [id]);
  } else {
    await db.runAsync('UPDATE transactions SET excluded=0, pinned=1 WHERE id=?;', [id]);
  }
}

/** Average monthly spend per envelope over the last ~6 months of synced
 *  transactions (spend only). Drives the Budget Planner's suggestions. */
export async function getAvgMonthlySpendByCategory(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ envelopeId: string; date: string; amount: number }>(
    `SELECT envelopeId, date, amount FROM transactions
     WHERE envelopeId IS NOT NULL AND excluded=0 AND amount > 0 AND date >= date('now','-6 months');`
  );
  if (rows.length === 0) return {};
  const months = new Set(rows.map((r) => r.date.slice(0, 7)));
  const span = Math.max(1, months.size);
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.envelopeId] = (totals[r.envelopeId] ?? 0) + r.amount;
  const avg: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) avg[k] = v / span;
  return avg;
}

/** Batch-set envelope budgets (used when applying a strategy). */
export async function setCategoryLimits(limits: Record<string, number>) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [id, limit] of Object.entries(limits)) {
      await db.runAsync('UPDATE categories SET monthlyLimit=? WHERE id=?;', [limit, id]);
    }
  });
}

/** Spend per envelope from synced transactions this month (spend = amount > 0). */
export async function getSyncedSpendByCategory(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ envelopeId: string; total: number }>(
    `SELECT envelopeId, SUM(amount) total FROM transactions
     WHERE envelopeId IS NOT NULL AND excluded=0 AND amount > 0
       AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
     GROUP BY envelopeId;`
  );
  return Object.fromEntries(rows.map((r) => [r.envelopeId, r.total]));
}

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
