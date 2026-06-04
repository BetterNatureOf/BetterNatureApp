# Notification Dispatcher

Cloudflare Worker that drains the `notifications_outbox` Firestore
collection every minute and ships:

- **Push** via OneSignal REST
- **Email** via Resend (primary) or Brevo (fallback)

Replaces the old `sms-dispatcher` Worker. Same idea, new channels.

## App-side env (set in Cloudflare Pages / `.env.local` / `app.json`)

```
EXPO_PUBLIC_ONESIGNAL_APP_ID="<UUID from OneSignal app>"
EXPO_PUBLIC_NOTIFY_PROVIDER="onesignal"
```

Only the public OneSignal app id ships to the client — the REST API
key stays server-side.

## Worker env (set with `wrangler secret put` in this folder)

```
FIRESTORE_PROJECT_ID        better-nature-app
GOOGLE_SERVICE_ACCOUNT      paste the full JSON of a service account
                            with role roles/datastore.user
ONESIGNAL_APP_ID            same UUID as above
ONESIGNAL_REST_API_KEY      OneSignal → Keys & IDs → REST API Key
RESEND_API_KEY              re_xxxxxxxx     (or omit and set BREVO)
BREVO_API_KEY               xkeysib-xxxx    (only if Resend unset)
MANUAL_TRIGGER_KEY          any random string for ad-hoc /tick calls
```

`EMAIL_FROM` is set in `wrangler.toml` as a regular var
(`"BetterNature <info@betternatureofficial.org>"`) — not a secret.

## Deploy

```bash
cd workers/notification-dispatcher
npm install -g wrangler            # if you don't already have it
wrangler login
wrangler secret put FIRESTORE_PROJECT_ID
wrangler secret put GOOGLE_SERVICE_ACCOUNT      # paste full JSON
wrangler secret put ONESIGNAL_APP_ID
wrangler secret put ONESIGNAL_REST_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put MANUAL_TRIGGER_KEY
wrangler deploy
```

The `[triggers] crons = ["* * * * *"]` line in `wrangler.toml` tells
Cloudflare to invoke `scheduled()` every minute.

## Manual test

```
curl "https://<worker-subdomain>.workers.dev/tick?key=<MANUAL_TRIGGER_KEY>"
```

Returns `{ processed: N }` and immediately drains the queue.
