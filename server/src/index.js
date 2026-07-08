import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { plaid } from './plaidClient.js';
import { saveItem, getItems, setCursor, initStore } from './store.js';

// --- Fail-fast env validation -----------------------------------------------
// This server guards real bank data. Refuse to boot half-configured — an unset
// API_KEY must never mean "auth disabled".
const REQUIRED = {
  API_KEY: (v) => !!v && v.length >= 32 && !v.startsWith('change-me'),
  DATA_KEY: (v) => !!v && /^[0-9a-f]{64}$/i.test(v),
  PLAID_CLIENT_ID: (v) => !!v && !v.startsWith('your_'),
  PLAID_SECRET: (v) => !!v && !v.startsWith('your_'),
};
for (const [name, ok] of Object.entries(REQUIRED)) {
  if (!ok(process.env[name])) {
    console.error(
      `FATAL: ${name} is missing or invalid in server/.env — see .env.example.` +
        (name === 'API_KEY' || name === 'DATA_KEY' ? '  Generate one with: openssl rand -hex 32' : '')
    );
    process.exit(1);
  }
}

const app = express();
// No CORS middleware on purpose: the only client is the native app (not subject
// to CORS), so browser origins get no permission to call this API at all.

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Auth guard with brute-force lockout -------------------------------------
// Every request (except /health) must present the shared API key. Repeated
// failures from an IP get locked out — keys shouldn't be guessable on the LAN.
const FAIL_LIMIT = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, lockedUntil }

app.use((req, res, next) => {
  if (req.path === '/health') return next();

  const ip = req.ip;
  const rec = failures.get(ip);
  if (rec && rec.lockedUntil > Date.now()) {
    return res.status(429).json({ error: 'too many failed attempts — try later' });
  }

  const given = Buffer.from(req.get('x-api-key') ?? '');
  const expected = Buffer.from(process.env.API_KEY);
  const ok = given.length === expected.length && timingSafeEqual(given, expected);

  if (!ok) {
    const count = (rec?.count ?? 0) + 1;
    failures.set(ip, {
      count,
      lockedUntil: count >= FAIL_LIMIT ? Date.now() + LOCKOUT_MS : 0,
    });
    console.warn(`auth failure from ${ip} (attempt ${count})`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  failures.delete(ip);
  next();
});

// Body parsing AFTER auth: unauthenticated callers never reach the JSON parser.
app.use(express.json({ limit: '100kb' }));

// 1) Create a short-lived link_token the mobile app uses to open Plaid Link.
//    You must fetch a fresh one every time you open Link.
app.post('/link/token', async (req, res) => {
  try {
    const userId = req.body?.userId || 'ballast-user';
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Ballast',
      products: ['transactions'], // grants accounts + balances too
      country_codes: ['US'],
      language: 'en',
      // Required when Link runs on Android. Must match app/app.json android.package
      // AND the Plaid dashboard "Allowed Android package names". Omitted if unset.
      android_package_name: process.env.ANDROID_PACKAGE_NAME || undefined,
    });
    res.json({ link_token: resp.data.link_token });
  } catch (e) {
    fail(res, e);
  }
});

// 2) Exchange the public_token from Link for a long-lived access_token.
//    The access_token is stored server-side ONLY (encrypted at rest) and never
//    sent to the phone.
app.post('/item/exchange', async (req, res) => {
  try {
    const { public_token } = req.body;
    if (!public_token) return res.status(400).json({ error: 'public_token required' });

    const ex = await plaid.itemPublicTokenExchange({ public_token });
    const access_token = ex.data.access_token;
    const item_id = ex.data.item_id;

    // Resolve a friendly institution name for display.
    let institution = null;
    try {
      const item = await plaid.itemGet({ access_token });
      const instId = item.data.item.institution_id;
      if (instId) {
        const i = await plaid.institutionsGetById({
          institution_id: instId,
          country_codes: ['US'],
        });
        institution = i.data.institution.name;
      }
    } catch { /* institution name is best-effort */ }

    await saveItem({ item_id, access_token, institution, cursor: null });
    res.json({ item_id, institution });
  } catch (e) {
    fail(res, e);
  }
});

// 3) Current balances across every linked item -> the app saves these as
//    synced accounts (source: 'plaid') alongside manual ones.
app.get('/accounts', async (_req, res) => {
  try {
    const accounts = [];
    for (const item of getItems()) {
      // accountsGet returns balances too and is bundled with Transactions —
      // avoids the metered per-call Balance product ($0.10/call).
      const acc = await plaid.accountsGet({ access_token: item.access_token });
      for (const a of acc.data.accounts) {
        accounts.push({
          id: a.account_id,
          item_id: item.item_id,
          name: a.name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          balance: a.balances.current,
          available: a.balances.available,
          institution: item.institution,
          source: 'plaid',
        });
      }
    }
    res.json({ accounts });
  } catch (e) {
    fail(res, e);
  }
});

// 4) Incremental transaction sync (cursor-based). Returns only what changed
//    since the last call, per item. Persist the cursor so next time is cheap.
// Trim Plaid's large transaction object down to what the app stores.
function trimTxn(t) {
  const pfc = t.personal_finance_category || {};
  return {
    id: t.transaction_id,
    account_id: t.account_id,
    name: t.name,
    merchant: t.merchant_name || t.name,
    amount: t.amount,                 // Plaid sign: + = money OUT (spend), - = money in
    date: t.date,
    pending: !!t.pending,
    pending_transaction_id: t.pending_transaction_id || null,
    pfc: pfc.primary || null,         // e.g. FOOD_AND_DRINK, TRANSPORTATION
    pfc_detailed: pfc.detailed || null,
  };
}

app.get('/transactions/sync', async (_req, res) => {
  try {
    const added = [], modified = [], removed = [];
    for (const item of getItems()) {
      let cursor = item.cursor || undefined;
      let hasMore = true;
      while (hasMore) {
        const r = await plaid.transactionsSync({ access_token: item.access_token, cursor });
        added.push(...r.data.added.map(trimTxn));
        modified.push(...r.data.modified.map(trimTxn));
        removed.push(...r.data.removed.map((x) => x.transaction_id));
        cursor = r.data.next_cursor;
        hasMore = r.data.has_more;
      }
      await setCursor(item.item_id, cursor);
    }
    res.json({ added, modified, removed });
  } catch (e) {
    fail(res, e);
  }
});

// Plaid returns rich error bodies — surface the useful bits (to the
// authenticated caller only; every route above sits behind the guard).
function fail(res, e) {
  const data = e?.response?.data;
  console.error('Plaid error:', data || e.message);
  res.status(500).json({ error: data?.error_message || e.message, code: data?.error_code });
}

// Terminal error handler — no stack traces to callers, ever.
app.use((err, _req, res, _next) => {
  console.error('request error:', err.message);
  res.status(err.status || 500).json({ error: 'request failed' });
});

await initStore(); // hydrate the token store (file or Upstash) before serving

const port = process.env.PORT || 8080;
// 0.0.0.0 (default) = reachable from the LAN, which the phone workflow needs.
// Behind a tunnel (cloudflared)? Set HOST=127.0.0.1 so ONLY the tunnel can reach it.
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () =>
  console.log(
    `Ballast server → http://${host}:${port}  ` +
      `(${host === '0.0.0.0' ? 'ALL interfaces — LAN-reachable' : 'bound to ' + host})  ` +
      `PLAID_ENV=${process.env.PLAID_ENV || 'sandbox'}`
  )
);
