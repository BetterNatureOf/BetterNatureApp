// Notification dispatcher — runs on a Cloudflare Worker cron
// every minute. Pulls all `notifications_outbox` docs where
// status == 'queued', fans out via the right channel (OneSignal
// for push, Resend for email), flips status to 'sent' or 'failed'.
//
// Required env (set in `wrangler secret put`):
//   FIRESTORE_PROJECT_ID      e.g. "better-nature-app"
//   GOOGLE_SERVICE_ACCOUNT    JSON blob of a service account with
//                             roles/datastore.user (used to mint
//                             access tokens for Firestore REST)
//   ONESIGNAL_APP_ID
//   ONESIGNAL_REST_API_KEY
//   RESEND_API_KEY            (or BREVO_API_KEY — see below)
//   EMAIL_FROM                e.g. "BetterNature <info@betternatureofficial.org>"
//
// To use Brevo instead of Resend, set BREVO_API_KEY and the
// dispatcher will switch automatically.

const FS_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ---- Google service-account JWT (no deps; runs on Workers V8) ----
async function getAccessToken(env) {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const enc = (o) => btoa(JSON.stringify(o))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuf(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${arrayBufferToB64Url(sig)}`;
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  }).then((r) => r.json());
  return tok.access_token;
}
function pemToBuf(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
function arrayBufferToB64Url(buf) {
  let b = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return btoa(b).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ---- Firestore REST helpers ----
async function listQueued(env, token) {
  const url = `${FS_BASE(env.FIRESTORE_PROJECT_ID)}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'notifications_outbox' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' }, op: 'EQUAL',
          value: { stringValue: 'queued' },
        },
      },
      limit: 50,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  return (Array.isArray(res) ? res : []).filter((r) => r.document).map((r) => ({
    name: r.document.name,
    fields: unwrapFields(r.document.fields || {}),
  }));
}
function unwrapFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) out[k] = v.stringValue;
    else if (v.integerValue !== undefined) out[k] = parseInt(v.integerValue, 10);
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.mapValue) out[k] = unwrapFields(v.mapValue.fields || {});
    else if (v.arrayValue) out[k] = (v.arrayValue.values || []).map((x) => unwrapFields({ x }).x);
    else out[k] = null;
  }
  return out;
}
async function patchStatus(env, token, name, status, error) {
  const fields = {
    status: { stringValue: status },
    sent_at: { timestampValue: new Date().toISOString() },
  };
  if (error) fields.error = { stringValue: String(error).slice(0, 480) };
  const url = `https://firestore.googleapis.com/v1/${name}?updateMask.fieldPaths=status&updateMask.fieldPaths=sent_at${error ? '&updateMask.fieldPaths=error' : ''}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ---- Senders ----
async function sendPush(env, doc) {
  const body = {
    app_id: env.ONESIGNAL_APP_ID,
    include_player_ids: [doc.fields.player_id],
    headings: { en: doc.fields.title || 'BetterNature' },
    contents: { en: doc.fields.body || '' },
    url: doc.fields.url || undefined,
    data: doc.fields.data || {},
  };
  const r = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OneSignal ${r.status}: ${await r.text()}`);
}

async function sendEmail(env, doc) {
  const subject = doc.fields.title || 'BetterNature';
  const greeting = doc.fields.name ? `Hi ${doc.fields.name},` : 'Hi,';
  const cta = doc.fields.url
    ? `<p style="margin:24px 0"><a href="${doc.fields.url}" style="background:#1B3A2D;color:#FFF;text-decoration:none;padding:12px 18px;border-radius:999px;display:inline-block;font-weight:700">Open in BetterNature</a></p>`
    : '';
  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1B3A2D">
      <h2 style="margin:0 0 8px;font-size:24px;color:#1B3A2D">${subject}</h2>
      <p style="margin:0 0 12px;color:#5A574F">${greeting}</p>
      <p style="margin:0 0 12px;color:#1B3A2D;line-height:1.5;white-space:pre-line">${escape(doc.fields.body || '')}</p>
      ${cta}
      <hr style="margin:24px 0;border:none;border-top:1px solid #EDE7D6"/>
      <p style="font-size:12px;color:#7A766C">BetterNature · EIN 99-4028399 · You can change notification preferences in the app at any time.</p>
    </div>`;

  // Resend preferred; Brevo fallback.
  if (env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [doc.fields.email],
        subject,
        html,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return;
  }
  if (env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: parseFrom(env.EMAIL_FROM),
        to: [{ email: doc.fields.email, name: doc.fields.name || '' }],
        subject,
        htmlContent: html,
      }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    return;
  }
  throw new Error('Neither RESEND_API_KEY nor BREVO_API_KEY is set');
}
function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function parseFrom(raw) {
  const m = /^(.+?)\s*<(.+?)>$/.exec(raw || '');
  return m ? { name: m[1], email: m[2] } : { email: raw };
}

// ---- Worker entry points ----
async function tick(env) {
  const token = await getAccessToken(env);
  const queued = await listQueued(env, token);
  for (const doc of queued) {
    try {
      if (doc.fields.channel === 'push')  await sendPush(env, doc);
      if (doc.fields.channel === 'email') await sendEmail(env, doc);
      await patchStatus(env, token, doc.name, 'sent');
    } catch (e) {
      console.warn('dispatch failed', doc.name, e);
      await patchStatus(env, token, doc.name, 'failed', e?.message);
    }
  }
  return { processed: queued.length };
}

export default {
  async fetch(req, env) {
    // Manual trigger via curl: GET /tick?key=...
    const url = new URL(req.url);
    if (url.pathname === '/tick' && url.searchParams.get('key') === env.MANUAL_TRIGGER_KEY) {
      const out = await tick(env);
      return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('notification-dispatcher\n');
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
