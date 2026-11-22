// Cloudflare Worker entry for the Better Nature rescue engine (free plan).
//   POST /<callable>   Firebase callable protocol: { data } → { result } | { error }
//   GET  /health       liveness
//   POST /tick         run the schedule now (header x-trigger-key = MANUAL_TRIGGER_KEY)
//   cron * * * * *     the schedule (queues jobs)
//   queue              runs one queued job per invocation
import engine from './engine.js';
import google from './google.js';

const DEFAULT_ORIGINS = ['https://app.betternatureofficial.org', 'http://localhost:8081', 'http://127.0.0.1:8081'];

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS);
  const ok = allowed.includes(origin);
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Firebase-AppCheck, Firebase-Instance-ID-Token, X-Firebase-GMPID, X-Client-Version',
    'Access-Control-Max-Age': '3600',
  };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export default {
  async fetch(request, env, ctx) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    const name = url.pathname.replace(/^\/+/, '');
    if (request.method === 'GET' && name === 'health') return json({ ok: true }, 200, headers);

    let db;
    try { db = engine.setup(env); engine.useQueue(env.JOBS); } catch (e) { console.error('setup', e.message); return json({ error: { status: 'INTERNAL', message: 'Server not configured.' } }, 500, headers); }

    if (request.method === 'POST' && name === 'tick') {
      if (!env.MANUAL_TRIGGER_KEY || request.headers.get('x-trigger-key') !== env.MANUAL_TRIGGER_KEY) return json({ error: 'forbidden' }, 403, headers);
      const only = url.searchParams.get('only');
      return json(await engine.tick(db, { only: only ? only.split(',') : null }), 200, headers);
    }
    if (request.method !== 'POST' || !/^[A-Za-z]+$/.test(name)) return json({ error: { status: 'NOT_FOUND', message: 'Not found' } }, 404, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: { status: 'INVALID_ARGUMENT', message: 'Bad request body' } }, 400, headers); }
    const ctxAuth = { uid: null, token: null };
    const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '')?.[1];
    if (bearer) {
      try {
        const v = await google.verifyIdToken(bearer, env.FIRESTORE_PROJECT_ID, { emulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST || null });
        ctxAuth.uid = v.uid; ctxAuth.token = v.token;
      } catch {
        return json({ error: { status: 'UNAUTHENTICATED', message: 'Your session expired. Sign in again.' } }, 401, headers);
      }
    }
    try {
      const result = await engine.call(db, name, body?.data, ctxAuth);
      ctx.waitUntil(engine.afterCall(db, name, body?.data).catch((e) => console.error('afterCall', name, e.message)));
      return json({ result: result ?? null }, 200, headers);
    } catch (e) {
      if (e && e.httpErrorCode && e.code) {
        return json({ error: { status: e.code.toUpperCase().replace(/-/g, '_'), message: e.message, details: e.details } }, e.httpErrorCode.status, headers);
      }
      console.error('callable', name, e);
      return json({ error: { status: 'INTERNAL', message: 'Something went wrong on our side. Nothing was changed if you see this.' } }, 500, headers);
    }
  },

  async scheduled(event, env, ctx) {
    const db = engine.setup(env);
    engine.useQueue(env.JOBS);
    ctx.waitUntil(engine.tick(db, { now: event.scheduledTime }).then((log) => console.log('tick', JSON.stringify(log))));
  },

  // One job per invocation (max_batch_size = 1), so each gets its own
  // request budget. Failed jobs retry (max_retries in wrangler.toml).
  async queue(batch, env) {
    const db = engine.setup(env);
    engine.useQueue(env.JOBS);
    for (const message of batch.messages) {
      try {
        await engine.runJob(db, message.body);
        message.ack();
      } catch (e) {
        console.error('job failed', JSON.stringify(message.body), e?.message);
        message.retry();
      }
    }
  },
};
