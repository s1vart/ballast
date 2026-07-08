# Deploying the Ballast API to Koyeb (free, always-on)

Goal: run the backend in the cloud so the phone reaches it without your Mac +
`adb reverse`. Koyeb's free "Hobby" instance is always-on and needs no credit card.

Koyeb's filesystem is **ephemeral** (wiped on every redeploy), so we keep the
encrypted token store in a free **Upstash Redis** database instead of `data.json`.
Both are free and card-free.

---

## 1. Upstash Redis (durable token store) — ~2 min

1. Sign up at <https://console.upstash.com> (GitHub login works; no card).
2. **Create Database** → any name → Region close to your Koyeb region → Free tier.
3. Open the DB → **REST API** section → copy **`UPSTASH_REDIS_REST_URL`** and
   **`UPSTASH_REDIS_REST_TOKEN`**. You'll paste these into Koyeb below.

## 2. Koyeb (the server) — ~5 min

1. Sign up at <https://www.koyeb.com> (GitHub login; no card for the free instance).
2. **Create Web Service** → **GitHub** → pick the `s1vart/ballast` repo.
3. Build settings:
   - **Work directory / monorepo path:** `server`
   - **Builder:** Dockerfile (the repo has `server/Dockerfile`). Buildpack also
     works if you'd rather — it auto-detects Node and runs `npm start`.
4. **Instance:** Free ("Nano" / Hobby).
5. **Port:** `8080` (the app also honors Koyeb's injected `$PORT` automatically).
6. **Health check:** HTTP path `/health`.
7. **Environment variables** — copy the values from your local `server/.env`.
   Mark the starred ones as **Secret** type in Koyeb:
   | Variable | Value |
   |---|---|
   | `PLAID_CLIENT_ID` | (same as local) |
   | `PLAID_SECRET` ★ | your **production** secret |
   | `PLAID_ENV` | `production` |
   | `ANDROID_PACKAGE_NAME` | `io.github.s1vart.ballast` |
   | `API_KEY` ★ | **same** as local (the app already ships this key) |
   | `DATA_KEY` ★ | **same** as local (so existing encrypted tokens stay readable) |
   | `UPSTASH_REDIS_REST_URL` | from step 1 |
   | `UPSTASH_REDIS_REST_TOKEN` ★ | from step 1 |

   Do **not** set `PORT` or `HOST` — Koyeb provides the port and `0.0.0.0` is correct.
8. **Deploy.** When healthy, Koyeb shows a public URL like
   `https://ballast-xxxx.koyeb.app`. Hit `https://<that>/health` in a browser —
   you should get `ok`.

## 3. Point the app at it (next phase)

Set `EXPO_PUBLIC_API_URL=https://<your>.koyeb.app` and build a standalone release
so the app runs without Metro. (Handled in the app-side untethering step.)

---

## Notes

- **Keep `API_KEY` and `DATA_KEY` identical to local.** The app already embeds the
  API key, and the same `DATA_KEY` keeps your existing encrypted tokens readable.
- **Banks:** with a fresh Upstash you'll **relink once** in the app (Connect a bank).
  To skip that, your existing encrypted tokens can be migrated into Upstash — ask
  and I'll give you a one-liner (they're valid from any server, being Plaid
  production tokens, as long as `DATA_KEY` matches).
- **Security:** Upstash only ever stores the *encrypted* blob; `DATA_KEY` lives only
  in Koyeb's env, so the KV provider can't read your bank tokens.
- Redeploys are safe now — tokens live in Upstash, not on Koyeb's disk.
