import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Dead-simple JSON store — fine for a single-user personal app.
// For anything shared/multi-user: swap for SQLite/Postgres AND encrypt access_token at rest.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data.json');

function load() {
  if (!existsSync(FILE)) return { items: {} };
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return { items: {} };
  }
}

function save(db) {
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

// An "item" = one linked bank login. Holds the long-lived access_token + a sync cursor.
export function saveItem(item) {
  const db = load();
  db.items[item.item_id] = { ...db.items[item.item_id], ...item };
  save(db);
}

export function getItems() {
  return Object.values(load().items);
}

export function setCursor(itemId, cursor) {
  const db = load();
  if (db.items[itemId]) {
    db.items[itemId].cursor = cursor;
    save(db);
  }
}
