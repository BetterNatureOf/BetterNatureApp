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

// H2 — fan out with DETERMINISTIC document IDs derived from the
// dedup key + the recipient uid, so retries after a partial failure
// are idempotent. The in-app bell and outbox job IDs are stable per
// (dedupKey, recipient), making `.set()` a safe re-run.
//
// When no dedup key is available (broadcasts), fall back to the
// prior random-id behavior and accept at-least-once semantics for
// those paths.
function safeKeyFragment(s) {
  return String(s || '').replace(/[\/\s]/g, '_').slice(0, 400);
}
async function fanOut(db, rows, inAppKind, title, body, url, dedupKey) {
  if (!rows.length) return { queued: 0, inapp: 0 };
  const BATCH = 200;
  let queued = 0, inapp = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const batch = db.batch();
    for (const row of slice) {
      const base = dedupKey ? `${safeKeyFragment(dedupKey)}__${row.user_id}` : null;
      const inboxRef = base
        ? db.collection('notifications').doc(`${base}__inapp`)
        : db.collection('notifications').doc();
      batch.set(inboxRef, {
        user_id: row.user_id,
        kind: inAppKind,
        title,
        body,
        url: url || null,
        read: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      const outRef = base
        ? db.collection('notifications_outbox').doc(`${base}__outbox`)
        : db.collection('notifications_outbox').doc();
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

// H3 — resolve the pickup ONCE and return both the snapshot and the
// derived recipients. All downstream work (auth, recipients, dedup
// key) uses the same `pk` so observations stay consistent across
// the callable's lifetime.
async function resolvePickupScope(db, caller, callerUser, data) {
  const pickupId = String(data?.pickup_id || '').trim();
  if (!pickupId) throw new functions.https.HttpsError('invalid-argument', 'pickup_id required');
  const p = await db.doc(`pickups/${pickupId}`).get();
  if (!p.exists) throw new functions.https.HttpsError('not-found', 'pickup not found');
  const pk = { id: p.id, ...p.data() };

  const partnerUid = await resolvePartnerUidFromPickup(db, pk);

  const isExec = userIsExec(callerUser);
  const callerIsRest =
       isExec
    || partnerUid === caller
    || pk.restaurant_user_id === caller
    || (callerUser && callerUser.restaurant_id && pk.restaurant_id === callerUser.restaurant_id);
  const callerIsClaimant     = pk.claimed_by === caller;

  // Ex-claimant authority: valid only when the matching transition
  // timestamp (released_at / handoff_at) is within the time window
  // AND is not in the future (G2 — rules now stamp these with
  // serverTimestamp, but belt-and-suspenders here protects any
  // legacy rows that already had client-controlled values).
  const now = Date.now();
  const releasedAtMs = toMillisTx(pk.released_at);
  const handoffAtMs  = toMillisTx(pk.handoff_at);
  const inWindow = (ms) => ms !== 0 && (now - ms) >= 0 && (now - ms) <= EX_PARTICIPANT_WINDOW_MS;
  const callerIsExClaimant  = pk.released_by === caller      && inWindow(releasedAtMs);
  const callerIsHandoffFrom = pk.handoff_from_uid === caller && inWindow(handoffAtMs);
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

  return { pk, recipients: [...recipients] };
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

// G2 + H3 — idempotency key for pickup notifications. The caller
// names which specific transition triggered this notification
// (`transition: 'claim' | 'release' | 'handoff' | 'enroute' |
// 'complete' | 'verify' | 'cancel' | 'new_pickup'`). The key uses
// THAT transition's timestamp only. Earlier implementation picked
// the first-truthy of released_at/handoff_at/.../claimed_at, which
// kept a historical breadcrumb on the pickup after a reclaim and
// silently deduped new legitimate messages.
const TRANSITION_STAMPS = {
  claim:      'claimed_at',
  release:    'released_at',
  handoff:    'handoff_at',
  enroute:    'enroute_at',
  complete:   'completed_at',
  verify:     'verified_by_restaurant_at',
  cancel:     'cancelled_at',
  new_pickup: 'created_at',
};
function idempotencyKeyForPickup(pk, intent, transition) {
  const stampField = TRANSITION_STAMPS[transition];
  if (!stampField) return null; // unknown transition → no dedup
  const raw = pk[stampField];
  const ms = raw && raw.toMillis ? raw.toMillis()
           : (raw && raw.seconds != null ? raw.seconds * 1000 : raw);
  if (!ms) return null;
  return [pk.id || '', intent || '', transition, String(ms)].join(':');
}

// H2 — the dedup doc records a status, not just presence. A replay
// is only considered "already-done" when the previous attempt
// committed (`status: 'completed'`). An in-progress reservation
// held by a crashed caller gets a lease window after which another
// caller takes over the work (fanOut is idempotent via deterministic
// doc IDs so overlapping retries converge on the same rows).
const LEASE_WINDOW_MS = 60 * 1000;
async function reserveDedup(db, key) {
  if (!key) return { kind: 'fresh', ref: null };
  const ref = db.collection('notification_dedup').doc(safeKeyFragment(key));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data() || {};
      if (d.status === 'completed') return { kind: 'completed', ref, previous: d };
      // In-progress reservation. If the lease is still live, caller
      // treats this as "someone else is handling it right now."
      // Expired leases get taken over.
      const startedMs =
        d.started_at && d.started_at.toMillis ? d.started_at.toMillis() :
        d.started_at && d.started_at.seconds != null ? d.started_at.seconds * 1000 :
        0;
      if (startedMs && Date.now() - startedMs < LEASE_WINDOW_MS) {
        return { kind: 'in_progress', ref, previous: d };
      }
    }
    tx.set(ref, {
      key,
      status: 'in_progress',
      started_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { kind: 'fresh', ref };
  });
}
async function markDedupCompleted(ref, counts) {
  if (!ref) return;
  await ref.set({
    status: 'completed',
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    inapp: counts?.inapp || 0,
    queued: counts?.queued || 0,
  }, { merge: true });
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
  let recipients = [], dedupKey = null, pk = null;
  if (scope === 'pickup') {
    // H3 — one read of the pickup for both authorization and
    // dedup-key derivation. The caller MUST specify `transition`
    // so the key doesn't collide with a stale historical stamp.
    const transition = String(data?.transition || '');
    const resolved = await resolvePickupScope(db, caller, callerUser, data);
    pk = resolved.pk;
    recipients = resolved.recipients;
    dedupKey = idempotencyKeyForPickup(pk, String(data?.intent || ''), transition);
    if (!dedupKey) {
      throw new functions.https.HttpsError('invalid-argument',
        'pickup scope requires `transition` matching the authoritative timestamp.');
    }
  } else if (scope === 'event') {
    recipients = await resolveEventScope(db, caller, callerUser, data);
    const transition = String(data?.transition || 'event_notice');
    dedupKey = `event:${String(data?.event_id || '')}:${kind}:${transition}`;
  } else if (scope === 'broadcast') {
    recipients = await resolveBroadcastScope(db, caller, callerUser, data);
    // Broadcasts stay uncoupled from dedup — pres/exec may legitimately
    // re-broadcast the same chapter with new content.
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown scope.');
  }

  // H2 — lease-based dedup. A completed receipt returns immediately
  // without re-queuing. An unexpired in-progress reservation means
  // another caller is handling this exact (operation, timestamp)
  // right now; return a soft deduped answer. Expired reservations
  // get taken over because the fanOut below is idempotent.
  let dedupRef = null;
  if (dedupKey) {
    const res = await reserveDedup(db, dedupKey);
    if (res.kind === 'completed') {
      return { ok: true, scope, queued: 0, inapp: 0, deduped: true, dedup_key: dedupKey };
    }
    if (res.kind === 'in_progress') {
      return { ok: true, scope, queued: 0, inapp: 0, deduped: true, in_progress: true, dedup_key: dedupKey };
    }
    dedupRef = res.ref;
  }

  const rows = recipients.map((uid) => ({ user_id: uid, kind, title, body, url, data: extra }));
  let out;
  try {
    out = await fanOut(db, rows, kind, title, body, url, dedupKey);
  } catch (e) {
    // H2 — fanOut failed. Leave the reservation in-progress so the
    // lease expires naturally; next caller takes over. Do NOT mark
    // completed with a half-written set.
    throw e;
  }
  // Only mark completed AFTER every batch commits.
  await markDedupCompleted(dedupRef, out);
  return { ok: true, scope, dedup_key: dedupKey, ...out };
});
