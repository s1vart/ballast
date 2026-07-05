import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { plaid } from './plaidClient.js';
import { saveItem, getItems, setCursor } from './store.js';

const app = express();
app.use(cors());
app.use(express.json());

// --- Simple shared-secret guard -------------------------------------------
// This backend can read your bank balances/transactions, so it must be private.
// The app sends API_KEY in the `x-api-key` header on every request.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.get('x-api-key') !== process.env.API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

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
//    The access_token is stored server-side ONLY and never sent to the phone.
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

    saveItem({ item_id, access_token, institution, cursor: null });
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
      const bal = await plaid.accountsBalanceGet({ access_token: item.access_token });
      for (const a of bal.data.accounts) {
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
app.get('/transactions/sync', async (_req, res) => {
  try {
    const added = [], modified = [], removed = [];
    for (const item of getItems()) {
      let cursor = item.cursor || undefined;
      let hasMore = true;
      while (hasMore) {
        const r = await plaid.transactionsSync({ access_token: item.access_token, cursor });
        added.push(...r.data.added);
        modified.push(...r.data.modified);
        removed.push(...r.data.removed);
        cursor = r.data.next_cursor;
        hasMore = r.data.has_more;
      }
      setCursor(item.item_id, cursor);
    }
    res.json({ added, modified, removed });
  } catch (e) {
    fail(res, e);
  }
});

// Plaid returns rich error bodies — surface the useful bits.
function fail(res, e) {
  const data = e?.response?.data;
  console.error('Plaid error:', data || e.message);
  res.status(500).json({ error: data?.error_message || e.message, code: data?.error_code });
}

const port = process.env.PORT || 8080;
app.listen(port, () =>
  console.log(`Ballast server → http://localhost:${port}  (PLAID_ENV=${process.env.PLAID_ENV || 'sandbox'})`)
);
