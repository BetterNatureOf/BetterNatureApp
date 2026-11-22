// Better Nature rescue engine: the server side of the app, run for free on
// a Cloudflare Worker instead of Cloud Functions. It reuses functions/*.js
// unchanged (through the shims) and replaces the three things a Worker
// doesn't have:
//   callables  → POST /<name> endpoints speaking the Firebase callable
//                protocol (the app uses httpsCallableFromURL)
//   schedules  → one Worker cron every minute that fans out by minute
//   triggers   → change handling: the app pings `pickupChanged` after its
//                writes, and the cron polls pickups by updated_at (plus new
//                users and activity rows) as the safety net. Every handler
//                reads current state and is idempotent, so running one
//                twice or late changes nothing.
const shimEngine = require('./shim/engine');
const { createFirestore, Timestamp, FieldValue } = require('./shim/firestore');
const G = require('./google');

// Static requires so the Worker bundler can include functions/*.js.
const MODULES = {
  'rescueDispatch': () => require('../../../functions/rescueDispatch'),
  'receivingSites': () => require('../../../functions/receivingSites'),
  'recordPickupRelease': () => require('../../../functions/recordPickupRelease'),
  'dispatchPickupTransition': () => require('../../../functions/dispatchPickupTransition'),
  'dispatchPickupCompletion': () => require('../../../functions/dispatchPickupCompletion'),
  'lib/publicProfileProjection': () => require('../../../functions/lib/publicProfileProjection'),
  'referralCredit': () => require('../../../functions/referralCredit'),
  'impactCounters': () => require('../../../functions/impactCounters'),
  'rescueOffers': () => require('../../../functions/rescueOffers'),
  'rescueSuggestions': () => require('../../../functions/rescueSuggestions'),
  'rescueRoute': () => require('../../../functions/rescueRoute'),
  'pickupReceiving': () => require('../../../functions/pickupReceiving'),
  'custodyCandidates': () => require('../../../functions/custodyCandidates'),
  'impactReports': () => require('../../../functions/impactReports'),
  'partnerRequests': () => require('../../../functions/partnerRequests'),
  'donationSchedules': () => require('../../../functions/donationSchedules'),
  'volunteerHistory': () => require('../../../functions/volunteerHistory'),
  'completePickup': () => require('../../../functions/completePickup'),
  'queueNotification': () => require('../../../functions/queueNotification'),
  'idViewer': () => require('../../../functions/idViewer'),
  'pickupExpiry': () => require('../../../functions/pickupExpiry'),
  'sweepNotificationDedup': () => require('../../../functions/sweepNotificationDedup'),
};
const fn = (name) => MODULES[name]();
const HttpsError = require('./shim/functions').HttpsError;
const ms = (v) => (v?.toMillis ? v.toMillis() : NaN);
const isPickupDoc = (path) => /^pickups\/[^/]+$/.test(path);

// Server writes to pickups carry updated_at too, so the poll sees them.
function stampPickups(path, mode, data) {
  if (!isPickupDoc(path) || !data || Object.prototype.hasOwnProperty.call(data, 'updated_at')) return data;
  return { ...data, updated_at: FieldValue.serverTimestamp() };
}

// Configure the shims from Worker env (or test env). Returns the db.
function setup(env, { fetchImpl = fetch } = {}) {
  const projectId = env.FIRESTORE_PROJECT_ID;
  if (!projectId) throw new Error('FIRESTORE_PROJECT_ID is not set');
  const emulator = env.FIRESTORE_EMULATOR_HOST || null;
  const sa = env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) : null;
  if (!emulator && !sa) throw new Error('GOOGLE_SERVICE_ACCOUNT is not set');
  const getToken = emulator ? async () => 'owner' : () => G.accessToken(sa, { fetchImpl });
  shimEngine.configure({
    factory: () => createFirestore({ projectId, baseUrl: emulator ? `http://${emulator}/v1` : undefined, getToken, beforeWrite: stampPickups, fetchImpl }),
    auth: G.authClient({ projectId, getToken, fetchImpl,
      baseUrl: env.FIREBASE_AUTH_EMULATOR_HOST ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com` : undefined }),
    storage: sa ? G.storageClient({ sa, bucket: env.STORAGE_BUCKET || `${projectId}.appspot.com`, getToken, fetchImpl }) : null,
  });
  if (env.MAPBOX_SERVER_TOKEN && typeof process !== 'undefined') process.env.MAPBOX_SERVER_TOKEN = env.MAPBOX_SERVER_TOKEN;
  return require('./shim/admin').firestore();
}

// ── change handling (replaces Firestore triggers) ────────────────────────
async function processPickup(db, pickupId) {
  if (typeof pickupId !== 'string' || !pickupId || pickupId.includes('/')) return { skipped: true };
  const ref = db.doc(`pickups/${pickupId}`);
  const snap = await ref.get();
  if (!snap.exists) return { missing: true };
  const p = snap.data();
  const out = {};
  out.dispatch = (await fn('rescueDispatch').onPickupChange(db, ref, p)).action;
  out.holds = await fn('receivingSites').reconcileReservationState(db, ref, p);
  const ctx = { params: { pickupId } };
  // A volunteer released before collection: ledger + donor notice, keyed by
  // released_at so this is safe to repeat.
  if (p.released_by && p.released_at && p.status === 'available' && !p.claimed_by) {
    const change = { before: { data: () => ({ ...p, status: 'claimed', claimed_by: p.released_by, released_at: null }) }, after: { data: () => p } };
    out.release = await fn('recordPickupRelease')._record(change, ctx, db);
    out.transition = await fn('dispatchPickupTransition')._dispatch(change, ctx, db).catch((e) => ({ error: e.message }));
  } else if (p.handoff_from_uid && p.handoff_at && p.status === 'available' && !p.claimed_by) {
    const change = { before: { data: () => ({ ...p, status: 'claimed', claimed_by: p.handoff_from_uid, handoff_at: null }) }, after: { data: () => p } };
    out.transition = await fn('dispatchPickupTransition')._dispatch(change, ctx, db).catch((e) => ({ error: e.message }));
  }
  return out;
}

async function dispatchCompletion(db, pickupId) {
  const snap = await db.doc(`pickup_completions/${pickupId}`).get();
  if (snap.exists) await fn('dispatchPickupCompletion')._dispatch(snap);
}

async function syncIdReview(db, uid) {
  const VALID = new Set(['pending', 'approved', 'rejected', 'none', 'unverified']);
  const userRef = db.doc(`users/${uid}`), reviewRef = db.doc(`id_reviews/${uid}`);
  return db.runTransaction(async (tx) => {
    const u = await tx.get(userRef);
    const r = await tx.get(reviewRef);
    if (!u.exists) return false;
    const live = r.exists ? (r.data().status || null) : null;
    if (live != null && !VALID.has(live)) return false;
    if ((u.data().verification_status || null) === live) return false;
    tx.update(userRef, { verification_status: live,
      verification_reviewed_at: live === 'approved' || live === 'rejected' ? FieldValue.serverTimestamp() : null });
    return true;
  });
}

async function onUserSeen(db, uid, data) {
  await fn('lib/publicProfileProjection').reconcile(db, uid).catch((e) => console.error('profile sync', uid, e.message));
  await fn('referralCredit').creditReferral(db, uid, null, data).catch((e) => console.error('referral', uid, e.message));
  await fn('impactCounters').volunteerSignedUp(db, uid, data).catch((e) => console.error('signup count', uid, e.message));
}

const isExecUser = (u) => !!u && !u.disabled && [u.role, ...(u.roles || [])].some((r) => ['executive', 'admin', 'super_admin'].includes(r));

// ── callables ────────────────────────────────────────────────────────────
const asContext = (ctx) => ({ auth: ctx.uid ? { uid: ctx.uid, token: ctx.token || {} } : null });
const CALLABLES = {
  respondToRescueOffer: (db, d, c) => fn('rescueOffers').respond(db, d, c.uid),
  suggestRescueVolunteers: (db, d, c) => fn('rescueSuggestions').suggest(db, d, c.uid),
  getRescueRoute: (db, d, c) => fn('rescueRoute').getRescueRoute(db, d, c.uid),
  confirmRescueDestination: (db, d, c) => fn('receivingSites').confirmDestination(db, d, c.uid),
  recordRescueRemainder: (db, d, c) => fn('receivingSites').recordRemainder(db, d, c.uid),
  assignRescueReceiver: (db, d, c) => fn('pickupReceiving').assignPickupReceiver(db, require('./shim/admin').auth(), d, c.uid),
  listCustodyCandidates: (db, d, c) => fn('custodyCandidates').listCustodyCandidates(db, d, c.uid),
  volunteerImpact: (db, d, c) => fn('impactReports').volunteerImpact(db, d, c.uid),
  chapterImpact: (db, d, c) => fn('impactReports').chapterImpact(db, d, c.uid),
  listPartnerSites: (db, d, c) => fn('partnerRequests').listPartnerSites(db, d, c.uid),
  requestReceivingPartner: (db, d, c) => fn('partnerRequests').requestPartner(db, d, c.uid),
  respondToPartnerRequest: (db, d, c) => fn('partnerRequests').respondPartner(db, d, c.uid),
  confirmDonationOccurrence: (db, d, c) => fn('donationSchedules').confirmOccurrence(db, d, c.uid, { requestPartner: fn('partnerRequests').requestPartner }),
  manageVolunteerHistory: (db, d, c) => fn('volunteerHistory').volunteerHistory(db, d, c.uid),
  completePickupOperation: (db, d, c) => fn('completePickup')._complete(d, asContext(c)),
  queueBusinessNotification: (db, d, c) => fn('queueNotification').queueBusinessNotification(d, asContext(c)),
  getIdViewUrl: (db, d, c) => fn('idViewer').getIdViewUrl(d, asContext(c)),
  // New for the Worker: the app asks for its own derived data to refresh
  // right after it writes, instead of waiting for a trigger.
  pickupChanged: async (db, d, c) => {
    if (!c.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    return processPickup(db, d?.pickupId);
  },
  syncMyPublicProfile: async (db, d, c) => {
    if (!c.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const user = (await db.doc(`users/${c.uid}`).get()).data();
    if (user) await onUserSeen(db, c.uid, user);
    return { ok: true };
  },
  syncIdReview: async (db, d, c) => {
    if (!c.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const uid = typeof d?.uid === 'string' && d.uid ? d.uid : c.uid;
    if (uid !== c.uid && !isExecUser((await db.doc(`users/${c.uid}`).get()).data())) throw new HttpsError('permission-denied', 'Not allowed.');
    return { changed: await syncIdReview(db, uid) };
  },
};

// Work to do after a callable succeeds (what a trigger used to do).
async function afterCall(db, name, data) {
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : typeof data?.pickup_id === 'string' ? data.pickup_id : null;
  if (name === 'completePickupOperation' && pickupId) await dispatchCompletion(db, pickupId);
  if (name === 'confirmDonationOccurrence') return;
  if (pickupId && name !== 'pickupChanged') await processPickup(db, pickupId);
}

async function call(db, name, data, ctx) {
  const handler = CALLABLES[name];
  if (!handler) throw new HttpsError('not-found', `Unknown function ${name}`);
  return handler(db, data ?? {}, ctx);
}

// ── schedule ─────────────────────────────────────────────────────────────
const CURSORS = 'engine_state/cursors';
async function pollCollection(db, key, collection, field, handle, { limit = 100 } = {}) {
  const cursors = (await db.doc(CURSORS).get()).data() || {};
  const since = cursors[key] || Timestamp.fromMillis(Date.now() - 60 * 60_000);
  const snap = await db.collection(collection).where(field, '>', since).orderBy(field).limit(limit).get();
  let last = since, handled = 0;
  for (const d of snap.docs) {
    try { await handle(d); handled++; } catch (e) { console.error(`poll ${key}`, d.id, e.message); }
    const t = d.data()[field];
    if (t?.toMillis && t.toMillis() > ms(last)) last = t;
  }
  if (handled && ms(last) > ms(since)) await db.doc(CURSORS).set({ [key]: last }, { merge: true });
  return handled;
}

async function tick(db, { now = Date.now(), only = null } = {}) {
  const minute = new Date(now).getUTCMinutes(), hour = new Date(now).getUTCHours();
  const due = (name, every) => (only ? only.includes(name) : minute % every === 0);
  const log = {};
  const run = async (name, every, work) => {
    if (!due(name, every)) return;
    try { log[name] = await work(); } catch (e) { log[name] = { error: e.message }; console.error(name, e); }
  };
  await run('pickups', 1, () => pollCollection(db, 'pickups', 'pickups', 'updated_at', (d) => processPickup(db, d.id)));
  await run('dispatch', 1, async () => (await fn('rescueDispatch').advanceDue(db, { now })).length);
  await run('newUsers', 1, () => pollCollection(db, 'users', 'users', 'created_at', (d) => onUserSeen(db, d.id, d.data())));
  await run('activity', 1, () => pollCollection(db, 'activity', 'member_activity', 'created_at',
    (d) => fn('impactCounters').eventCheckedIn(db, d.id, d.data())));
  await run('expiry', 5, async () => ({
    offers: (await fn('pickupExpiry').expireOpenPickups(db)).expired,
    partners: (await fn('partnerRequests').expirePartnerRequests(db, { now })).moved,
    holds: await fn('receivingSites').sweepReservations(db, { now }),
  }));
  await run('dedup', 5, () => fn('sweepNotificationDedup').sweepNotificationDedup({}));
  await run('recurring', 15, () => fn('donationSchedules').materialize(db, { now }));
  // Full sweeps every 6 hours catch anything a ping or poll missed.
  if (only ? only.includes('sweep') : (minute === 7 && hour % 6 === 0)) {
    await run('sweep', 1, async () => {
      let users = 0, reviews = 0;
      for (const d of (await db.collection('users').get()).docs) { await onUserSeen(db, d.id, d.data()); users++; }
      for (const d of (await db.collection('id_reviews').get()).docs) { if (await syncIdReview(db, d.id)) reviews++; }
      return { users, reviews };
    });
  }
  return log;
}

module.exports = { setup, call, afterCall, tick, processPickup, syncIdReview, CALLABLES, stampPickups };
