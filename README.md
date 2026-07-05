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
2. Under **Link → API / allowed** settings, add your **Android package name** (use `com.yourname.ballast`, or whatever you set in `app/app.json`). This must match, or Android Link fails.

---

## 2 · Backend

```bash
cd server
npm install
cp .env.example .env      # then fill in PLAID_CLIENT_ID, PLAID_SECRET, API_KEY, ANDROID_PACKAGE_NAME
npm start
```

Check it's up: `curl localhost:8080/health` → `{"ok":true}`.

`API_KEY` is a long random string you invent; the app must send the same value. It's what keeps this token-holding server private.

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
| **Physical Galaxy S25** | `http://<your-computer-LAN-IP>:8080` (e.g. `http://192.168.1.20:8080`), or expose the backend with a tunnel (`npx localtunnel --port 8080`) / deploy it |

---

## Going to production

1. In the Plaid dashboard, request **Production** access (Trial is auto-approved for most).
2. Set `PLAID_ENV=production` and use your **production secret**. Now real bank logins work.
3. **Deploy the backend** (Render / Railway / Fly.io / a serverless function) — don't run it off your laptop.
4. **Harden it:** replace the single `API_KEY` with real per-user auth, and **encrypt `access_token`s at rest** (swap `store.js`'s JSON file for SQLite/Postgres with encryption).
5. Handle **re-linking:** when a bank connection expires you'll get `ITEM_LOGIN_REQUIRED`; create a link token in *update mode* and have the user reconnect.
6. Publishing to the Play Store as a finance app that accesses bank data brings extra review — budget time for it.

---

## How this plugs into Ballast

Synced accounts are saved with `source: 'plaid'`; hand-entered ones stay `source: 'manual'` — they share one table and the **same end-of-month projection math**. `App.tsx` is a deliberately minimal demo screen proving the loop works; the next step is to drop the full Ballast UI (Home / Budgets / Goals / Accounts / Paycheck from the prototype) on top of this data layer.

## File map

```
server/
  src/index.js        Express routes: /link/token, /item/exchange, /accounts, /transactions/sync
  src/plaidClient.js  Plaid SDK config (reads env)
  src/store.js        JSON store for items (access_token + sync cursor)
  .env.example        secrets template
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
