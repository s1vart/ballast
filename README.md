# Ballast — Plaid integration scaffold

Real, working **Plaid** bank-linking for the Ballast budgeting app, in two parts:

```
  ┌─────────────┐   link_token    ┌──────────────┐   client_id +   ┌───────┐
  │  Expo app   │ ───────────────▶│  your server │   secret ──────▶│ Plaid │
  │  (S25)      │   public_token  │  (Node)      │   access_token   │       │
  │             │ ◀───────────────│  holds tokens│ ◀───────────────│       │
  └─────────────┘   balances/txns └──────────────┘                 └───────┘
```

**The golden rule:** your Plaid `secret` and the bank `access_token`s live **only on the server**, never on the phone. The app only ever handles a short-lived `link_token` (to open Link) and a short-lived `public_token` (which it hands straight to the server to exchange).

- `server/` — Node/Express backend. Creates link tokens, exchanges public tokens, returns balances + transactions.
- `app/` — Expo/React Native source. Opens Plaid Link and stores synced accounts next to manual ones.

---

## Prerequisites

- **Node 18+**
- A **Plaid account** — sign up at [dashboard.plaid.com](https://dashboard.plaid.com). The free **Trial plan** gives you real production data for up to 10 linked banks; **Sandbox** (fake test banks) is always free and is what you'll use first.
- For the app: **Android Studio** (emulator) or a physical device, because the Plaid SDK needs a **development build — it does NOT run in Expo Go.**

---

## 1 · Plaid dashboard

1. Copy your **`client_id`** and **Sandbox `secret`** from **Developers → Keys**.
2. Under **Link → API / allowed** settings, add your **Android package name** (use `com.wekivasoftware.ballast`, or whatever you set in `app/app.json`). This must match, or Android Link fails.

---

## 2 · Backend

```bash
cd server
npm ci                    # reproducible install from the committed lockfile
cp .env.example .env      # then fill in PLAID_CLIENT_ID, PLAID_SECRET, ANDROID_PACKAGE_NAME
openssl rand -hex 32      # -> paste as API_KEY in .env
openssl rand -hex 32      # -> paste as DATA_KEY in .env  (back it up! losing it = relink banks)
npm start
```

Check it's up: `curl localhost:8080/health` → `{"ok":true}`.

- `API_KEY` — shared secret the app sends on every request (`x-api-key`). The server **refuses to start** if it's missing, shorter than 32 chars, or the placeholder — an unset key must never mean "auth off".
- `DATA_KEY` — encrypts the Plaid `access_token`s at rest in `data.json` (AES-256-GCM). Stealing the file no longer means stealing the tokens.

---

## 3 · Expo app

These files are meant to drop into a fresh Expo app (so versions stay current):

```bash
# from the repo root
npx create-expo-app@latest app-tmp   # scaffolds a clean Expo project
# copy our files over the generated ones:
cp -R app/* app-tmp/ && cp app/.env.example app-tmp/.env
mv app app-orig && mv app-tmp app     # swap in the merged project

cd app
npx expo install react-native-plaid-link-sdk expo-sqlite expo-status-bar
```

Then:

1. Edit **`app/.env`** → set `EXPO_PUBLIC_API_URL` (see the networking note below) and `EXPO_PUBLIC_API_KEY` (must equal the server's `API_KEY`).
2. In **`app/app.json`**, set `android.package` to the **same** value you registered in the Plaid dashboard and put in the server's `ANDROID_PACKAGE_NAME`.
3. Make a **development build** (required — native module):

```bash
npx expo prebuild
npx expo run:android      # builds + installs a dev client on an emulator/device
# (iOS: npx expo run:ios)
```

> The Plaid SDK autolinks after `prebuild`; no extra config plugin is needed for it.
> If the Android build complains about `minSdkVersion`, add `expo-build-properties` and set Android `minSdkVersion` to 24+.

---

## 4 · Try it (Sandbox)

1. Backend running (`PLAID_ENV=sandbox`), dev build running on the emulator/device.
2. Tap **Connect a bank** → pick any sandbox institution (e.g. "First Platypus Bank").
3. Log in with the Plaid sandbox test credentials:
   - username **`user_good`**, password **`pass_good`**
   - if asked for an MFA code, use **`1234`**
4. Link closes → the app fetches balances → accounts appear tagged **Synced** with the running total on top.

---

## Networking (the usual gotcha)

`EXPO_PUBLIC_API_URL` must be reachable **from the phone/emulator**, not from your dev machine:

| Running on | Use |
|---|---|
| Android emulator | `http://10.0.2.2:8080` (alias for your computer's localhost) |
| iOS simulator | `http://localhost:8080` |
| **Physical Galaxy S25** | `http://<your-computer-LAN-IP>:8080` (e.g. `http://192.168.1.20:8080`), or a free [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`) for HTTPS from anywhere |

> **Release builds & plain `http://`:** Android **debug** builds (what `npx expo run:android` makes) allow cleartext HTTP, so the LAN URL works while developing. **Release** builds block it by default. When you build a release APK, either point the app at an **https** URL (the Cloudflare Tunnel gives you free TLS — set `HOST=127.0.0.1` in `server/.env` so only the tunnel can reach the server), or whitelist just your LAN IP via `expo-build-properties` → Android `networkSecurityConfig`. Don't flip global `usesCleartextTraffic=true`.

---

## Security model

What's already enforced by the code:

- **Fail-closed auth** — every route (except `/health`) requires `x-api-key`, compared timing-safe; the server refuses to boot without a strong `API_KEY`.
- **Brute-force lockout** — 10 failed auth attempts from an IP → 15-minute lockout (429).
- **Tokens encrypted at rest** — Plaid `access_token`s are AES-256-GCM-encrypted in `data.json` (`DATA_KEY`), written atomically with file mode `600`; a corrupt store is set aside loudly, never silently overwritten.
- **Tokens never reach the phone** — the app only handles short-lived `link_token`/`public_token`; the long-lived `access_token` stays server-side.
- **No secrets in git** — `.gitignore` covers `.env*` variants, `data.json*`, DB files, and Android signing keys/credentials; only `.env.example` templates are tracked. The app refuses to run with the placeholder key.
- **No CORS** — the only client is the native app (not subject to CORS), so browsers get no permission to call this API at all.
- **No stack traces to callers** — JSON parsing happens after auth; a terminal error handler returns generic errors.

Known accepted trade-offs at personal scale (revisit before anything multi-user):

- `EXPO_PUBLIC_API_KEY` ships inside the APK — extractable by anyone who has the APK file. Fine while the app never leaves your phone; **rotate the key if you ever share the APK.**
- LAN traffic is plain HTTP — acceptable on your own Wi-Fi; use the HTTPS tunnel when off-network.
- Single shared key, not per-user auth — replace before any second user exists.

Good habits: enable **secret scanning + push protection** on the GitHub repo (free for public repos), keep FileVault on, and run `npm audit` occasionally.

## Going to production

1. In the Plaid dashboard, request **Production** access (Trial is auto-approved for most).
2. Set `PLAID_ENV=production` and use your **production secret**. Now real bank logins work. (The broadened `.gitignore` already covers `.env.production`-style variants — still, never `git add` an env file.)
3. **Hosting:** local Mac + Cloudflare Tunnel (`HOST=127.0.0.1`) stays free; Koyeb's free nano instance is the no-card always-on option. Behind any public URL, TLS must terminate at the edge — never port-forward raw HTTP.
4. **Harden further:** replace the single `API_KEY` with real per-user auth before anyone else uses it; consider Cloudflare Access (free) in front of the tunnel for MFA.
5. Handle **re-linking:** when a bank connection expires you'll get `ITEM_LOGIN_REQUIRED`; create a link token in *update mode* and have the user reconnect.
6. Publishing to the Play Store as a finance app that accesses bank data brings extra review — budget time for it.

---

## How this plugs into Ballast

Synced accounts are saved with `source: 'plaid'`; hand-entered ones stay `source: 'manual'` — they share one table and the **same end-of-month projection math**. `App.tsx` is a deliberately minimal demo screen proving the loop works; the next step is to drop the full Ballast UI (Home / Budgets / Goals / Accounts / Paycheck from the prototype) on top of this data layer.

## File map

```
server/
  src/index.js        Express routes: /link/token, /item/exchange, /accounts, /transactions/sync
                      + fail-fast env checks, timing-safe auth, lockout, error handling
  src/plaidClient.js  Plaid SDK config (reads env)
  src/store.js        JSON store for items — access_tokens AES-256-GCM encrypted at rest
  .env.example        secrets template (API_KEY + DATA_KEY: openssl rand -hex 32)
app/
  App.tsx             demo screen (total + accounts + Connect button)
  app.json            Expo config (android.package, expo-sqlite plugin)
  src/plaidLink.ts    opens Plaid Link, exchanges the public_token
  src/api.ts          typed fetch helpers to the backend
  src/db.ts           expo-sqlite: accounts table (manual + plaid)
  src/config.ts       API URL + key + client user id
  src/types.ts        Account / PlaidAccount types
  src/components/     ConnectBankButton, AccountsList
```
