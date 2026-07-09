import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Single-user personal store, Plaid access_tokens ENCRYPTED at rest
// (AES-256-GCM, key = DATA_KEY). "Stole the store" ≠ "stole the bank tokens".
//
// Two backends, chosen at boot:
//   • local file (default) — fine for dev and Mac-hosted setups.
//   • Upstash Redis (if UPSTASH_REDIS_REST_URL + _TOKEN are set) — for cloud
//     hosts with an ephemeral filesystem (e.g. Koyeb), so linked banks survive
//     redeploys. Uses global fetch — no extra npm dependency. The blob stored
//     remotely already has its tokens encrypted; DATA_KEY never leaves the app.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data.json');
const TMP = FILE + '.tmp';

const KV_URL = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_KEY = 'ballast:store';
const useKV = !!(KV_URL && KV_TOKEN);

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
  if (scheme !== 'gcm') throw new Error('unrecognized ciphertext format in the token store');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(ctHex, 'hex')), d.final()]).toString('utf8');
}

// --- backends --------------------------------------------------------------
function fileLoad() {
  if (!existsSync(FILE)) return { items: {} };
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (e) {
    const aside = FILE + '.corrupt';
    renameSync(FILE, aside);
    console.error(`FATAL: data.json was unreadable (${e.message}); moved to ${aside}`);
    throw new Error('token store corrupt — inspect data.json.corrupt');
  }
}

function fileSave(db) {
  writeFileSync(TMP, JSON.stringify(db, null, 2), { mode: 0o600 }); // atomic: tmp then rename
  renameSync(TMP, FILE);
}

async function kvCmd(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash ${command[0]} failed (${res.status}): ${await res.text()}`);
  return (await res.json()).result;
}

const kvLoad = async () => {
  const raw = await kvCmd(['GET', KV_KEY]);
  return raw ? JSON.parse(raw) : { items: {} };
};
const kvSave = (db) => kvCmd(['SET', KV_KEY, JSON.stringify(db)]);

// --- in-memory cache, hydrated once at boot --------------------------------
let db = { items: {} };

/** Load the store into memory. Must be awaited before app.listen(). If the KV
 *  backend is configured but unreachable, this throws — we fail fast rather than
 *  boot with an empty store and risk overwriting live tokens on the next write. */
export async function initStore() {
  db = useKV ? await kvLoad() : fileLoad();
  console.log(`token store: ${useKV ? 'Upstash Redis (durable across redeploys)' : 'local file'} — ${Object.keys(db.items).length} item(s) loaded`);
}

async function persist() {
  if (useKV) await kvSave(db);
  else fileSave(db);
}

// An "item" = one linked bank login. Holds the long-lived access_token + a sync cursor.
export async function saveItem(item) {
  const stored = { ...db.items[item.item_id], ...item };
  if (item.access_token) stored.access_token = encrypt(item.access_token);
  db.items[item.item_id] = stored;
  await persist();
}

export function getItems() {
  return Object.values(db.items).map((it) => ({ ...it, access_token: decrypt(it.access_token) }));
}

export async function setCursor(itemId, cursor) {
  if (db.items[itemId]) {
    db.items[itemId].cursor = cursor; // cursor is not sensitive; token stays encrypted
    await persist();
  }
}

export async function removeItem(itemId) {
  if (db.items[itemId]) {
    delete db.items[itemId];
    await persist();
  }
}
