// A2 R-followup #3 — authorized cross-user notification queue.
//
// Firestore rules limit direct /notifications_outbox client writes
// to self-recipient only (ordinary) + exec (admin tooling). Every
// cross-user notification goes through this callable, which
// validates the business operation, resolves eligible recipients,
// and writes both the in-app bell row (/notifications) and the
// delivery job (/notifications_outbox) with the admin SDK.
//
// Supported scopes:
//   scope: 'pickup'    + intent: 'new_pickup_broadcast' | 'to_partner' | 'to_claimant'
//                        — writer is pickup's restaurant OR current/former claimant OR exec.
//   scope: 'event'     — writer is pres of event's chapter OR exec.
//   scope: 'broadcast' + chapter_id   — writer is that chapter's pres OR exec.
//   scope: 'broadcast' + audience_scope: 'global_bn'|'global_restaurants'|'global_all'
//                                      — exec only.
//
// Returns { queued: N, inapp: N } on success.
//
// B3 — resolves partner UID from /restaurants/<rid>.user_id, not
// from pk.restaurant_id (which is a document id in production).
// B4 — accepts caller == pk.released_by OR pk.handoff_from_uid as
// the pickup's "former claimant" authority for post-release and
// post-handoff notifications.
// B5 — implements global audience scopes explicitly instead of
// routing them to a wildcard chapter query.
// B6 — writes the in-app bell alongside the outbox job per
// recipient so no migrated path silently loses the bell.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const EXEC_ROLES = new Set(['executive', 'admin', 'super_admin']);
const PRES_ROLES = new Set(['chapter_president', 'chapter_pres']);

async function loadUser(uid) {
  if (!uid) return null;
  const s = await admin.firestore().doc(`users/${uid}`).get();
  return s.exists ? { id: s.id, ...s.data() } : null;
}
async function loadRestaurant(rid) {
  if (!rid) return null;
  const s = await admin.firestore().doc(`restaurants/${rid}`).get();
  return s.exists ? { id: s.id, ...s.data() } : null;
}

function userIsExec(u) {
  if (!u) return false;
  const r = u.role, rs = Array.isArray(u.roles) ? u.roles : [];
  return EXEC_ROLES.has(r) || rs.some((x) => EXEC_ROLES.has(x));
}
function userIsPres(u) {
  if (!u) return false;
  const r = u.role, rs = Array.isArray(u.roles) ? u.roles : [];
  return PRES_ROLES.has(r) || rs.some((x) => PRES_ROLES.has(x));
}

async function fanOut(db, rows, inAppKind, title, body, url) {
  if (!rows.length) return { queued: 0, inapp: 0 };
  // Batched writes: one /notifications doc per recipient (in-app
  // bell, B6) and one /notifications_outbox doc per recipient
  // (dispatcher delivery). Each pair goes in its own batch commit
  // to stay under Firestore's 500-op batch limit for broadcasts.
  const BATCH = 200;
  let queued = 0, inapp = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const batch = db.batch();
    for (const row of slice) {
      const inboxRef = db.collection('notifications').doc();
      batch.set(inboxRef, {
        user_id: row.user_id,
        kind: inAppKind,
        title,
        body,
        url: url || null,
        read: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      const outRef = db.collection('notifications_outbox').doc();
      batch.set(outRef, {
        ...row,
        status: 'queued',
        attempts: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    queued += slice.length;
    inapp  += slice.length;
  }
  return { queued, inapp };
}

async function resolvePartnerUidFromPickup(db, pk) {
  // B3 — pickup.restaurant_id is a /restaurants doc id in production,
  // not a user uid. Resolve the owning user via /restaurants/<rid>.
  // Fall back to a denormalised pk.restaurant_user_id when present,
  // but verify it against the authoritative /restaurants doc to catch
  // stale denormalisation.
  if (!pk || !pk.restaurant_id) return null;
  const rest = await loadRestaurant(pk.restaurant_id);
  const owner = rest?.user_id || null;
  if (owner) return owner;
  // Last-ditch — some early-schema pickups stored restaurant_id ==
  // owner uid directly. If a user doc exists under that id, that's
  // the owner.
  const maybeUser = await loadUser(pk.restaurant_id);
  return maybeUser ? maybeUser.id : null;
}

// F9 — ex-claimant authority must be time-boxed. Once a run is
// handed off / released, the former participant can post ONE
// post-event notification shortly after the transition. Beyond this
// window the pickup is someone else's run and messaging authority
// must not persist indefinitely.
const EX_PARTICIPANT_WINDOW_MS = 30 * 60 * 1000;

function toMillisTx(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { return 0; } }
  if (v.seconds != null) return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  const d = new Date(v); return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

async function resolvePickupScope(db, caller, callerUser, data) {
  const pickupId = String(data?.pickup_id || '').trim();
  if (!pickupId) throw new functions.https.HttpsError('invalid-argument', 'pickup_id required');
  const p = await db.doc(`pickups/${pickupId}`).get();
  if (!p.exists) throw new functions.https.HttpsError('not-found', 'pickup not found');
  const pk = p.data();

  const partnerUid = await resolvePartnerUidFromPickup(db, pk);

  const isExec = userIsExec(callerUser);
  const callerIsRest =
       isExec
    || partnerUid === caller
    || pk.restaurant_user_id === caller
    || (callerUser && callerUser.restaurant_id && pk.restaurant_id === callerUser.restaurant_id);
  const callerIsClaimant     = pk.claimed_by === caller;

  // Ex-claimant authority: valid only when the matching transition
  // timestamp (released_at / handoff_at) is within the time window.
  const now = Date.now();
  const releasedAtMs = toMillisTx(pk.released_at);
  const handoffAtMs  = toMillisTx(pk.handoff_at);
  const callerIsExClaimant =
    pk.released_by === caller &&
    (releasedAtMs !== 0 && now - releasedAtMs <= EX_PARTICIPANT_WINDOW_MS);
  const callerIsHandoffFrom =
    pk.handoff_from_uid === caller &&
    (handoffAtMs !== 0 && now - handoffAtMs <= EX_PARTICIPANT_WINDOW_MS);
  const callerIsPickupParty  = callerIsRest || callerIsClaimant || callerIsExClaimant || callerIsHandoffFrom;

  if (!isExec && !callerIsPickupParty) {
    throw new functions.https.HttpsError('permission-denied',
      'Only this pickup\'s partner, current claimant, or former claimant may queue notifications for it.');
  }

  const intent = String(data?.intent || 'to_partner');
  const recipients = new Set();

  if (intent === 'new_pickup_broadcast') {
    if (!(callerIsRest || isExec)) {
      throw new functions.https.HttpsError('permission-denied', 'Not pickup owner.');
    }
    if (!pk.chapter_id) throw new functions.https.HttpsError('failed-precondition', 'pickup missing chapter_id');
    const q = await db.collection('public_profiles').where('chapter_id', '==', pk.chapter_id).get();
    for (const d of q.docs) {
      const r = d.data();
      if ((r.role_label || 'member') === 'partner') continue;
      recipients.add(d.id);
    }
  } else if (intent === 'to_partner') {
    // B4 — ex-claimants (release, handoff) may notify the partner.
    if (!callerIsClaimant && !callerIsExClaimant && !callerIsHandoffFrom && !isExec) {
      throw new functions.https.HttpsError('permission-denied', 'Only the claimant / ex-claimant may notify the partner.');
    }
    if (partnerUid) recipients.add(partnerUid);
  } else if (intent === 'to_claimant') {
    if (!callerIsRest && !isExec) {
      throw new functions.https.HttpsError('permission-denied', 'Only the partner may notify the claimant.');
    }
    // Current claimant on an active run, or ex-claimant for a late
    // partner-initiated apology after release.
    const target = pk.claimed_by || pk.released_by || pk.handoff_from_uid;
    if (target) recipients.add(target);
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown pickup notification intent.');
  }

  return [...recipients];
}

async function resolveEventScope(db, caller, callerUser, data) {
  if (!userIsExec(callerUser) && !userIsPres(callerUser)) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized for event broadcasts.');
  }
  const eventId = String(data?.event_id || '').trim();
  if (!eventId) throw new functions.https.HttpsError('invalid-argument', 'event_id required');
  const ev = await db.doc(`events/${eventId}`).get();
  if (!ev.exists) throw new functions.https.HttpsError('not-found', 'event not found');
  const chapterId = ev.data().chapter_id;
  if (!userIsExec(callerUser) && callerUser.chapter_id !== chapterId) {
    throw new functions.https.HttpsError('permission-denied', 'Event is in another chapter.');
  }
  const q = await db.collection('public_profiles').where('chapter_id', '==', chapterId).get();
  return q.docs
    .filter((d) => (d.data().role_label || 'member') !== 'partner')
    .map((d) => d.id);
}

async function resolveBroadcastScope(db, caller, callerUser, data) {
  const isExec = userIsExec(callerUser);
  const isPres = userIsPres(callerUser);
  if (!isExec && !isPres) {
    throw new functions.https.HttpsError('permission-denied', 'Broadcasts restricted to president or exec.');
  }
  // B5 — explicit global audience scopes. Exec-only.
  const audienceScope = String(data?.audience_scope || '').trim();
  if (audienceScope) {
    if (!isExec) {
      throw new functions.https.HttpsError('permission-denied', 'Global broadcasts restricted to exec.');
    }
    const q = await db.collection('public_profiles').get();
    const rows = q.docs.map((d) => ({ id: d.id, ...d.data() }));
    const filtered = rows.filter((r) => {
      const label = r.role_label || 'member';
      if (audienceScope === 'global_bn')          return label !== 'partner';
      if (audienceScope === 'global_restaurants') return label === 'partner';
      if (audienceScope === 'global_all')         return true;
      return false;
    });
    return filtered.map((r) => r.uid || r.id);
  }
  // Chapter-scoped broadcast.
  const chapterId = String(data?.chapter_id || '').trim();
  if (!chapterId) throw new functions.https.HttpsError('invalid-argument', 'chapter_id or audience_scope required');
  if (isPres && !isExec && callerUser.chapter_id !== chapterId) {
    throw new functions.https.HttpsError('permission-denied', 'President may only broadcast to own chapter.');
  }
  const q = await db.collection('public_profiles').where('chapter_id', '==', chapterId).get();
  return q.docs.map((d) => d.id);
}

exports.queueBusinessNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const caller = context.auth.uid;
  const callerUser = await loadUser(caller);
  if (!callerUser) throw new functions.https.HttpsError('permission-denied', 'Account not found.');

  const scope = String(data?.scope || '');
  const kind  = String(data?.kind  || 'general');
  const title = String(data?.title || '').slice(0, 200);
  const body  = String(data?.body  || '').slice(0, 2000);
  const url   = data?.url ? String(data.url).slice(0, 1024) : null;
  const extra = (data?.data && typeof data.data === 'object') ? data.data : {};
  if (!title || !body) throw new functions.https.HttpsError('invalid-argument', 'title + body required');

  const db = admin.firestore();
  let recipients;
  if (scope === 'pickup')          recipients = await resolvePickupScope(db, caller, callerUser, data);
  else if (scope === 'event')      recipients = await resolveEventScope(db, caller, callerUser, data);
  else if (scope === 'broadcast')  recipients = await resolveBroadcastScope(db, caller, callerUser, data);
  else throw new functions.https.HttpsError('invalid-argument', 'Unknown scope.');

  const rows = recipients.map((uid) => ({ user_id: uid, kind, title, body, url, data: extra }));
  const out = await fanOut(db, rows, kind, title, body, url);
  return { ok: true, scope, ...out };
});
