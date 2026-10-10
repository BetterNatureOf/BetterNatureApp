// A2 R-followup #3 — authorized cross-user notification queue.
//
// Firestore rules now limit direct /notifications_outbox client
// writes to self-recipient only. Every cross-user notification goes
// through this callable, which validates the business operation,
// resolves eligible recipients, and writes outbox rows with the
// admin SDK (which bypasses rules).
//
// Supported scopes:
//   scope: 'pickup'    — writer is pickup's restaurant OR claimant.
//                        Recipients are limited to the OTHER party +
//                        chapter members (for new-pickup broadcasts).
//   scope: 'event'     — writer is pres of event's chapter OR exec.
//                        Recipients must be in the event's chapter.
//   scope: 'broadcast' — writer is pres; recipients must share the
//                        writer's chapter. Exec may broadcast to any
//                        chapter they name.
//
// Returns { queued: N } on success. Thrown errors become client-
// visible friendly messages via functions.https.HttpsError.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const EXEC_ROLES = new Set(['executive', 'admin', 'super_admin']);
const PRES_ROLES = new Set(['chapter_president', 'chapter_pres']);

async function loadUser(uid) {
  if (!uid) return null;
  const s = await admin.firestore().doc(`users/${uid}`).get();
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

async function enqueueMany(db, rows) {
  if (!rows.length) return 0;
  const batch = db.batch();
  for (const row of rows) {
    const ref = db.collection('notifications_outbox').doc();
    batch.set(ref, {
      ...row,
      status: 'queued',
      attempts: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return rows.length;
}

async function resolvePickupScope(db, caller, callerUser, data) {
  const pickupId = String(data?.pickup_id || '').trim();
  if (!pickupId) throw new functions.https.HttpsError('invalid-argument', 'pickup_id required');
  const p = await db.doc(`pickups/${pickupId}`).get();
  if (!p.exists) throw new functions.https.HttpsError('not-found', 'pickup not found');
  const pk = p.data();

  const isExec = userIsExec(callerUser);
  const callerIsRest = isExec
    || pk.restaurant_id === caller
    || pk.restaurant_user_id === caller
    || (callerUser && callerUser.restaurant_id && pk.restaurant_id === callerUser.restaurant_id);
  const callerIsClaimant = pk.claimed_by === caller;

  if (!isExec && !callerIsRest && !callerIsClaimant) {
    throw new functions.https.HttpsError('permission-denied',
      'Only this pickup\'s partner or claimant may queue notifications for it.');
  }

  // Resolve allowed recipients. The caller doesn't choose freely —
  // this callable derives recipients from the pickup state and the
  // intent (title/body/kind) the caller provides.
  const intent = String(data?.intent || 'status');
  const recipients = new Set();

  if (intent === 'new_pickup_broadcast') {
    // Partner just posted. Fan out to chapter members (minus the
    // partner themselves). Use /public_profiles for chapter lookup.
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
    // Claimant → partner. Dispatcher resolves address from the
    // partner's /users doc server-side.
    if (!callerIsClaimant && !isExec) {
      throw new functions.https.HttpsError('permission-denied', 'Only the claimant may notify the partner.');
    }
    const partnerUid = pk.restaurant_user_id || pk.restaurant_id;
    if (partnerUid) recipients.add(partnerUid);
  } else if (intent === 'to_claimant') {
    // Partner → claimant.
    if (!callerIsRest && !isExec) {
      throw new functions.https.HttpsError('permission-denied', 'Only the partner may notify the claimant.');
    }
    if (pk.claimed_by) recipients.add(pk.claimed_by);
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
  const recipients = q.docs
    .filter((d) => (d.data().role_label || 'member') !== 'partner')
    .map((d) => d.id);
  return recipients;
}

async function resolveBroadcastScope(db, caller, callerUser, data) {
  const isExec = userIsExec(callerUser);
  const isPres = userIsPres(callerUser);
  if (!isExec && !isPres) {
    throw new functions.https.HttpsError('permission-denied', 'Broadcasts restricted to president or exec.');
  }
  const chapterId = String(data?.chapter_id || '').trim();
  if (!chapterId) throw new functions.https.HttpsError('invalid-argument', 'chapter_id required');
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
  if (scope === 'pickup')     recipients = await resolvePickupScope(db, caller, callerUser, data);
  else if (scope === 'event') recipients = await resolveEventScope(db, caller, callerUser, data);
  else if (scope === 'broadcast') recipients = await resolveBroadcastScope(db, caller, callerUser, data);
  else throw new functions.https.HttpsError('invalid-argument', 'Unknown scope.');

  const rows = recipients.map((uid) => ({ user_id: uid, kind, title, body, url, data: extra }));
  const queued = await enqueueMany(db, rows);
  return { queued, scope };
});
