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

// H2 + I2 — fan out with DETERMINISTIC document IDs derived from
// the dedup key + the recipient uid, so retries after a partial
// failure converge on the same docs. Each per-recipient write uses
// `batch.create()` (not `set()`): if the doc already exists the
// batch fails ALREADY_EXISTS and we treat that recipient as
// already-delivered. This preserves live dispatcher state
// (status: sent / channels_done / attempts) and the recipient's
// read:false flag — the reviewer's I2 reproduction (expired lease
// retry resetting a sent job back to queued and a read bell back
// to unread) is prevented at the write boundary.
//
// Multi-batch broadcasts (new_pickup, event, chapter) use batches
// of up to 200 recipients. If any single doc in a batch already
// exists, the whole batch fails; we fall back to a per-doc
// create() loop that skips existing docs. This keeps progress
// recoverable without rewriting completed work.
function safeKeyFragment(s) {
  return String(s || '').replace(/[\/\s]/g, '_').slice(0, 400);
}
// I2 + J2 — single unified per-doc path for both single and
// multi-recipient fan-outs. Earlier design had a separate atomic
// branch for single-recipient intents; a batch create() that
// rejects ALREADY_EXISTS failed the whole batch and skipped
// creating the missing half of a partial pair. The per-doc path
// below creates each side independently (both sides try even if
// the other is already present), so bell-only / outbox-only
// states are repaired on the next invocation. Each per-doc
// create() swallows ALREADY_EXISTS so dispatcher/bell state is
// never overwritten.
async function pairPresent(db, base) {
  if (!base) return { inbox: false, outbox: false };
  const [inSnap, outSnap] = await Promise.all([
    db.collection('notifications').doc(`${base}__inapp`).get(),
    db.collection('notifications_outbox').doc(`${base}__outbox`).get(),
  ]);
  return { inbox: inSnap.exists, outbox: outSnap.exists };
}
async function fanOutOne(db, row, inAppKind, title, body, url, base) {
  const inboxRef = base
    ? db.collection('notifications').doc(`${base}__inapp`)
    : db.collection('notifications').doc();
  const outRef = base
    ? db.collection('notifications_outbox').doc(`${base}__outbox`)
    : db.collection('notifications_outbox').doc();
  let inappCreated = false, outboxCreated = false;
  try {
    await inboxRef.create({
      user_id: row.user_id, kind: inAppKind, title, body,
      url: url || null, read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    inappCreated = true;
  } catch (e) {
    if ((e?.code || '') !== 6 && !/ALREADY_EXISTS/i.test(String(e?.message || ''))) throw e;
  }
  try {
    await outRef.create({
      ...row, status: 'queued', attempts: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    outboxCreated = true;
  } catch (e) {
    if ((e?.code || '') !== 6 && !/ALREADY_EXISTS/i.test(String(e?.message || ''))) throw e;
  }
  return { inappCreated, outboxCreated };
}
async function fanOut(db, rows, inAppKind, title, body, url, dedupKey) {
  if (!rows.length) return { queued: 0, inapp: 0, allPairsPresent: true };
  let queued = 0, inapp = 0;
  let allPairsPresent = true;
  for (const row of rows) {
    const base = dedupKey ? `${safeKeyFragment(dedupKey)}__${row.user_id}` : null;
    const r = await fanOutOne(db, row, inAppKind, title, body, url, base);
    if (r.inappCreated)  inapp  += 1;
    if (r.outboxCreated) queued += 1;
    // J2 — verify BOTH halves of the pair exist (either newly
    // created or pre-existing from a prior attempt). Only mark
    // the work receipt complete when every pair is confirmed.
    if (base) {
      const presence = r.inappCreated && r.outboxCreated
        ? { inbox: true, outbox: true }
        : await pairPresent(db, base);
      if (!presence.inbox || !presence.outbox) allPairsPresent = false;
    }
  }
  return { queued, inapp, allPairsPresent };
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

  // I3 — the caller named a transition in `data.transition`. The
  // actor authorized for THAT transition must match the caller.
  // Previously any pickup party could spoof any transition name
  // and consume a different party's dedup key.
  const transition = String(data?.transition || '');
  const transitionActorOk = isExec || (() => {
    if (transition === 'claim' || transition === 'enroute' || transition === 'complete') {
      // These transitions are performed by the CURRENT claimant.
      return callerIsClaimant;
    }
    if (transition === 'release') {
      return pk.released_by === caller;
    }
    if (transition === 'handoff') {
      // Originating actor (the person handing off) is handoff_from_uid.
      return pk.handoff_from_uid === caller;
    }
    if (transition === 'verify' || transition === 'cancel' || transition === 'new_pickup') {
      return callerIsRest;
    }
    return false;
  })();
  if (!transitionActorOk) {
    throw new functions.https.HttpsError('permission-denied',
      `Caller is not the authorized actor for transition '${transition}'.`);
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

// K1 — reservation (dedup lease) AND durable work are now written
// atomically inside ONE Firestore transaction. The reviewer's prior
// gap: `reserveDedup` committed first and `recordWork` was a
// separate write; a crash in between left an orphan reservation
// with no frozen payload for the sweep to recover. Combining them
// closes that window: either both exist or neither does.
//
// Returned shape describes what state the key is in:
//   kind: 'fresh'       — this caller owns a NEW reservation + work
//   kind: 'completed'   — a prior attempt finished; replay returns deduped
//   kind: 'in_progress' — another caller holds an unexpired lease
//   kind: 'resumable'   — stored work exists but the lease expired
//                         and this caller took over; frozenWork is
//                         the authoritative payload+recipients to
//                         execute (K2 — never substitute live input)
const LEASE_WINDOW_MS = 60 * 1000;
async function reserveLeaseAndWork(db, dedupKey, livePayload) {
  if (!dedupKey) return { kind: 'fresh', dedupRef: null, workRef: null, frozen: null };
  const dedupRef = db.collection('notification_dedup').doc(safeKeyFragment(dedupKey));
  const workRef  = db.collection('notification_work').doc(safeKeyFragment(dedupKey));
  return db.runTransaction(async (tx) => {
    const [dSnap, wSnap] = await Promise.all([tx.get(dedupRef), tx.get(workRef)]);
    // Fast path: receipt says completed → replay dedupes.
    if (dSnap.exists && dSnap.data()?.status === 'completed') {
      return { kind: 'completed', dedupRef, workRef, frozen: wSnap.exists ? wSnap.data() : null };
    }
    // Lease still live → someone else is handling it right now.
    const startedMs =
      dSnap.exists && dSnap.data()?.started_at && dSnap.data().started_at.toMillis
        ? dSnap.data().started_at.toMillis() : 0;
    if (startedMs && Date.now() - startedMs < LEASE_WINDOW_MS) {
      return { kind: 'in_progress', dedupRef, workRef, frozen: wSnap.exists ? wSnap.data() : null };
    }
    // Stamp the lease; create the work doc if missing (atomic with
    // the lease write). If the work already exists (expired lease
    // takeover), KEEP its frozen payload — the current caller
    // becomes a resumer, not an overwriter.
    tx.set(dedupRef, {
      key: dedupKey,
      status: 'in_progress',
      started_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (!wSnap.exists) {
      tx.create(workRef, {
        key: dedupKey,
        status: 'pending',
        attempts: 0,
        ...livePayload,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { kind: 'fresh', dedupRef, workRef, frozen: null };
    }
    // Work existed; this caller is resuming it.
    tx.set(workRef, {
      attempts: admin.firestore.FieldValue.increment(1),
      last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { kind: 'resumable', dedupRef, workRef, frozen: wSnap.data() };
  });
}
async function markBothCompleted(dedupRef, workRef, counts) {
  if (!dedupRef && !workRef) return;
  const batch = admin.firestore().batch();
  if (dedupRef) batch.set(dedupRef, {
    status: 'completed',
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    inapp: counts?.inapp || 0,
    queued: counts?.queued || 0,
  }, { merge: true });
  if (workRef) batch.set(workRef, {
    status: 'completed',
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    inapp: counts?.inapp || 0,
    queued: counts?.queued || 0,
  }, { merge: true });
  await batch.commit();
}

// Exported so sweepNotificationDedup can run the SAME fanOut flow
// against the stored payload when the live callable fails to
// finish. Signature receives the work doc's data (payload +
// recipients) + the dedupKey; returns the same shape as fanOut().
exports._resumeFromWork = async function _resumeFromWork(db, work) {
  const rows = (work.recipients || []).map((uid) => ({
    user_id: uid,
    kind: work.kind,
    title: work.title,
    body: work.body,
    url: work.url || null,
    data: work.data || {},
  }));
  return fanOut(db, rows, work.kind, work.title, work.body, work.url || null, work.key);
};

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

  // K1 + K2 — atomic reserve-and-work. The transaction either
  // commits BOTH the lease and the frozen work doc or neither; a
  // crash between the two no longer orphans a reservation. On an
  // expired-lease takeover (`resumable`), the frozen work in the
  // DB wins — this caller does NOT substitute its own payload or
  // recipient list, so a stale restaurant owner or a modified
  // retry body can never diverge from what was originally
  // authorized.
  const livePayload = {
    scope, kind, title, body, url,
    data: extra,
    recipients,
  };
  let dedupRef = null, workRef = null;
  let effective = livePayload; // what this runner will actually execute
  if (dedupKey) {
    const res = await reserveLeaseAndWork(db, dedupKey, livePayload);
    if (res.kind === 'completed') {
      return { ok: true, scope, queued: 0, inapp: 0, deduped: true, dedup_key: dedupKey };
    }
    if (res.kind === 'in_progress') {
      return { ok: true, scope, queued: 0, inapp: 0, deduped: true, in_progress: true, dedup_key: dedupKey };
    }
    dedupRef = res.dedupRef;
    workRef  = res.workRef;
    if (res.kind === 'resumable' && res.frozen) {
      // K2 — execute the frozen operation, not the live input.
      effective = {
        scope:      res.frozen.scope,
        kind:       res.frozen.kind,
        title:      res.frozen.title,
        body:       res.frozen.body,
        url:        res.frozen.url || null,
        data:       res.frozen.data || {},
        recipients: Array.isArray(res.frozen.recipients) ? res.frozen.recipients : [],
      };
    }
  }

  const rows = effective.recipients.map((uid) => ({
    user_id: uid,
    kind:    effective.kind,
    title:   effective.title,
    body:    effective.body,
    url:     effective.url,
    data:    effective.data,
  }));

  let out;
  try {
    out = await fanOut(db, rows, effective.kind, effective.title, effective.body, effective.url, dedupKey);
  } catch (e) {
    // Leave reservation + work record in-progress; sweep will
    // resume on lease expiry. Do NOT mark completed with a half-
    // written set.
    throw e;
  }

  // J2 — only mark completed when EVERY pair (bell + outbox) is
  // present. If a half is missing, leave both in-progress; the
  // scheduled sweep's fenced claim takes over on lease expiry and
  // finishes via the same fanOut (idempotent via deterministic IDs).
  if (out.allPairsPresent !== false) {
    await markBothCompleted(dedupRef, workRef, out);
  }
  return { ok: true, scope, dedup_key: dedupKey, ...out };
});

// Shared transition key keeps legacy client and server trigger retries in one operation.
exports._idempotencyKeyForPickup = idempotencyKeyForPickup;
