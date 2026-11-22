# Rescue engine (free server side)

Cloudflare Worker that runs Better Nature's server logic on Cloudflare's
**free** Workers plan, so Firebase can stay on the free **Spark** plan (no
Google billing account). It replaces Cloud Functions:

| Cloud Functions piece | Here |
| --- | --- |
| Callables (`respondToRescueOffer`, `confirmRescueDestination`, …) | `POST /<name>`, same Firebase callable protocol. The app calls it with `httpsCallableFromURL` when `EXPO_PUBLIC_RESCUE_ENGINE_URL` is set (`src/services/server.js`). |
| Scheduled functions | One cron every minute (`[triggers]` in `wrangler.toml`); the engine runs each job on its own cadence (1 / 5 / 15 min, 6 h sweep). |
| Firestore triggers | The app pings `pickupChanged` after its pickup writes; the cron polls `pickups` by `updated_at`, new `users` and `member_activity` by `created_at`, and a 6-hourly sweep re-syncs profiles and ID reviews. Handlers read current state and are idempotent. |
| Expo push trigger (`sendPushOnNotification`) | Dropped. Push and email go through the existing `notification-dispatcher` Worker (OneSignal / Resend) from `notifications_outbox`. |

`functions/*.js` is reused unchanged: `[alias]` in `wrangler.toml` swaps
`firebase-admin` / `firebase-functions` for small REST shims in `src/shim/`.

## Free-tier limits that matter

- Workers free: 100,000 requests/day, 10 ms CPU per request (I/O waiting
  doesn't count), cron triggers included.
- Firestore Spark: 50,000 reads, 20,000 writes, 20,000 deletes per day. The
  engine's idle polling uses roughly 8–10k reads/day.
- Changes the app doesn't ping about are picked up within about a minute.

## One-time setup (owner)

1. **Service account key (free).** Firebase console → Project settings →
   Service accounts → *Generate new private key*. In Google Cloud IAM, give
   that account: *Cloud Datastore User*, *Firebase Authentication Viewer*,
   *Storage Object Viewer*. Keep the JSON file private.
2. **Cloudflare (free account)**, in this folder:
   ```bash
   npx wrangler login
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT   # paste the whole JSON
   npx wrangler secret put MANUAL_TRIGGER_KEY       # any random string
   npx wrangler deploy
   ```
   Note the printed URL, e.g. `https://bn-rescue-engine.<you>.workers.dev`.
3. **App:** set `EXPO_PUBLIC_RESCUE_ENGINE_URL` to that URL in Cloudflare
   Pages (production env) and in `.env.local` for builds.
4. **Firebase (free on Spark):**
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes,storage --project better-nature-app
   ```
5. Check: `curl https://<worker-url>/health` → `{"ok":true}`.

Optional secrets: `MAPBOX_SERVER_TOKEN` (road times), `STORAGE_BUCKET`
(defaults to `<project>.appspot.com`).

## Local development

```bash
npm run emulators:free      # auth, firestore, storage — no Cloud Functions
npm run seed:emulators:alt
npm run engine:dev          # this Worker on http://127.0.0.1:8787
npm run web:free            # the app, pointed at the Worker
```

## Tests

`npm run test:engine` runs every `tests/rules/*.test.mjs` suite through the
REST shims (the Worker's data layer) plus `test/worker.test.mjs`, which
drives the Worker's `fetch` handler and schedule against the emulator.
