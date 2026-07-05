import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Simple JSON store for a single-user personal app — but with the Plaid
// access_tokens ENCRYPTED at rest (AES-256-GCM, key = DATA_KEY in .env).
// "Stole data.json" no longer means "stole the bank tokens".
// For anything shared/multi-user: swap for SQLite/Postgres.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data.json');
const TMP = FILE + '.tmp';

// --- encryption ------------------------------------------------------------
const key = () => Buffer.from(process.env.DATA_KEY, 'hex'); // validated at startup

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['gcm', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ct.toString('hex')].join(':');
}

function decrypt(blob) {
  const [scheme, ivHex, tagHex, ctHex] = String(blob).split(':');
  if (scheme !== 'gcm') throw new Error('unrecognized ciphertext format in data.json');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(ctHex, 'hex')), d.final()]).toString('utf8');
}

// --- persistence -----------------------------------------------------------
function load() {
  if (!existsSync(FILE)) return { items: {} };
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (e) {
    // Never silently overwrite live bank tokens: set the corrupt file aside loudly.
    const aside = FILE + '.corrupt';
    renameSync(FILE, aside);
    console.error(`FATAL: data.json was unreadable (${e.message}); moved to ${aside}`);
    throw new Error('token store corrupt — inspect data.json.corrupt');
  }
}

function save(db) {
  // Atomic: write tmp then rename, so a crash mid-write can't corrupt the store.
  // mode 600: only this user can read the file.
  writeFileSync(TMP, JSON.stringify(db, null, 2), { mode: 0o600 });
  renameSync(TMP, FILE);
}

// An "item" = one linked bank login. Holds the long-lived access_token + a sync cursor.
export function saveItem(item) {
  const db = load();
  const stored = { ...db.items[item.item_id], ...item };
  if (item.access_token) stored.access_token = encrypt(item.access_token);
  db.items[item.item_id] = stored;
  save(db);
}

export function getItems() {
  return Object.values(load().items).map((it) => ({
    ...it,
    access_token: decrypt(it.access_token),
  }));
}

export function setCursor(itemId, cursor) {
  const db = load();
  if (db.items[itemId]) {
    db.items[itemId].cursor = cursor; // cursor is not sensitive; token stays encrypted
    save(db);
  }
}
