import * as SQLite from 'expo-sqlite';
import type { Account } from './types';

// Local, on-device store. Manual and Plaid-synced accounts live in one table,
// distinguished by `source`, so the rest of the app treats them identically.
let _db: SQLite.SQLiteDatabase | null = null;

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
  `);
  return _db;
}

export async function getAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY source DESC, name ASC;');
}

/** Insert or update accounts (used by the Plaid sync). Keyed on id. */
export async function upsertAccounts(accounts: Account[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const a of accounts) {
      await db.runAsync(
        `INSERT INTO accounts (id, name, type, subtype, mask, balance, institution, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name        = excluded.name,
           type        = excluded.type,
           subtype     = excluded.subtype,
           mask        = excluded.mask,
           balance     = excluded.balance,
           institution = excluded.institution,
           source      = excluded.source;`,
        [
          a.id,
          a.name,
          a.type ?? null,
          a.subtype ?? null,
          a.mask ?? null,
          a.balance ?? null,
          a.institution ?? null,
          a.source,
        ]
      );
    }
  });
}

/** Add a hand-entered account (the no-bank-linking path still works). */
export async function addManualAccount(name: string, balance: number) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO accounts (id, name, balance, source) VALUES (?, ?, ?, 'manual');`,
    [`manual-${Date.now()}`, name, balance]
  );
}
