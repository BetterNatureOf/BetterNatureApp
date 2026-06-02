// SMS dispatcher — Cloudflare Worker.
//
// Runs on a cron trigger every minute. Pulls queued outbox docs from
// Firestore via REST, sends them through TextBelt, marks each one
// sent or failed.
//
// Cloudflare Workers free tier:
//   • 100,000 requests/day
//   • Cron triggers included
//   • Zero monthly cost
// More than enough for any chapter-scale SMS volume.
//
// SETUP
//   1. wrangler.toml in this folder (see wrangler.toml.example)
//   2. Set secrets:
//        wrangler secret put TEXTBELT_KEY
//        wrangler secret put FIREBASE_PROJECT_ID
//        wrangler secret put FIREBASE_API_KEY      # from Firebase Console
//        wrangler secret put FIREBASE_SA_EMAIL     # service account email
//        wrangler secret put FIREBASE_SA_KEY       # service account private key
//   3. Set cron trigger in wrangler.toml: crons = ["*/1 * * * *"]
//   4. wrangler deploy
//
// The free TextBelt key ("textbelt") only sends 1 SMS/day per IP.
// Purchase a real key at textbelt.com for production.

const TEXTBELT_ENDPOINT = 'https://textbelt.com/text';

export default {
  // Cron trigger entry point
  async scheduled(event, env, ctx) {
    ctx.waitUntil(flushOutbox(env));
  },
  // HTTP trigger (handy for manual flush + healthcheck)
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/flush') {
      const result = await flushOutbox(env);
      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('sms-dispatcher: ok', { status: 200 });
  },
};

async function flushOutbox(env) {
  const token = await getFirebaseAccessToken(env);
  const docs = await listQueued(env, token);
  const results = [];
  const now = Date.now();
  for (const d of docs) {
    // Honor scheduled send time
    const sendAt = d.fields?.send_at?.timestampValue || d.fields?.send_at?.stringValue;
    if (sendAt) {
      const t = new Date(sendAt).getTime();
      if (Number.isFinite(t) && t > now) continue;
    }
    const to   = d.fields?.to?.stringValue;
    const body = d.fields?.body?.stringValue;
    if (!to || !body) {
      await markDone(env, token, d.name, 'invalid');
      continue;
    }
    const sent = await sendViaTextBelt({ to, body, key: env.TEXTBELT_KEY });
    await markDone(env, token, d.name, sent.success ? 'sent' : 'failed', sent.error);
    results.push({ to, success: sent.success, error: sent.error });
  }
  return { processed: results.length, results };
}

async function sendViaTextBelt({ to, body, key }) {
  const res = await fetch(TEXTBELT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: to, message: body, key: key || 'textbelt' }),
  });
  const j = await res.json().catch(() => ({}));
  return { success: !!j.success, error: j.error || null, textId: j.textId };
}

// ── Firestore REST helpers ─────────────────────────────────────────
async function listQueued(env, token) {
  // structuredQuery for status == 'queued', limit 50 per cron tick.
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'sms_outbox' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'queued' },
          },
        },
        limit: 50,
      },
    }),
  });
  const arr = await res.json();
  return (arr || []).map((r) => r.document).filter(Boolean);
}

async function markDone(env, token, docName, status, error) {
  const fields = {
    status: { stringValue: status },
    last_attempt_at: { timestampValue: new Date().toISOString() },
  };
  if (error) fields.last_error = { stringValue: String(error).slice(0, 500) };
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=status&updateMask.fieldPaths=last_attempt_at&updateMask.fieldPaths=last_error`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
}

// ── Google auth (service account → access token) ───────────────────
async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoaUrl(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = btoaUrl(JSON.stringify({
    iss: env.FIREBASE_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = await signRS256(unsigned, env.FIREBASE_SA_KEY);
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const j = await res.json();
  return j.access_token;
}

function btoaUrl(s) {
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signRS256(input, pemKey) {
  const pkcs8 = pemToPkcs8(pemKey);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return btoaUrl(String.fromCharCode(...new Uint8Array(sig)));
}

function pemToPkcs8(pem) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}
