// Unified notification dispatcher — client-side half.
//
// A2 R-followup #3: /notifications_outbox client writes are now
// locked to self-recipient only (confirmations, bell drops). Every
// cross-user notification routes through the
// `queueBusinessNotification` Cloud Function callable, which
// validates the operation server-side and writes outbox rows with
// admin SDK. The callable also derives recipients from the actual
// pickup/event state rather than trusting the caller's list.
//
// In-app notifications still fire directly from the client via
// /notifications create (recipient reading their own doc is
// authorized by rules). The dispatcher resolves push_token + email
// server-side and sends.
import { collection, addDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, isFirebaseConfigured } from '../config/firebase';
import useAuthStore from '../store/authStore';

async function dropInApp({ uid, kind, title, body, url }) {
  await addDoc(collection(db, 'notifications'), {
    user_id: uid,
    kind,
    title,
    body,
    url: url || null,
    read: false,
    created_at: serverTimestamp(),
  });
}

async function dropSelfOutbox({ uid, kind, title, body, url, data }) {
  await addDoc(collection(db, 'notifications_outbox'), {
    user_id: uid,
    kind,
    title,
    body,
    url: url || null,
    data: data || {},
    status: 'queued',
    attempts: 0,
    created_at: serverTimestamp(),
  });
}

function currentUid() {
  try { return useAuthStore.getState?.()?.user?.id || null; } catch { return null; }
}

/**
 * Legacy direct API. Still supported for SELF notifications only
 * (confirmations the user queues for themselves). For cross-user
 * flows prefer the scoped helpers below.
 */
export async function enqueueNotification(opts) {
  const { recipients = [], kind = 'general', title, body, url, data = {}, skipInApp } = opts;
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };
  if (!title || !body) return { ok: false, reason: 'missing_content' };

  const me = currentUid();
  let inapp = 0, outbox = 0, deferred = 0;
  for (const uid of recipients) {
    if (!uid) continue;
    if (!skipInApp) {
      try { await dropInApp({ uid, kind, title, body, url }); inapp += 1; } catch (e) { console.warn('inapp', e); }
    }
    if (uid === me) {
      try { await dropSelfOutbox({ uid, kind, title, body, url, data }); outbox += 1; }
      catch (e) { console.warn('self outbox', e); }
    } else {
      // Direct client write is denied by rules for a non-self
      // recipient. Caller should migrate to one of the scoped helpers
      // below. Count as deferred so callers can observe + fix.
      deferred += 1;
    }
  }
  return { ok: true, inapp, outbox, deferred, total: recipients.length };
}

// Scoped helpers — route through the Cloud Function callable so the
// server validates operation + resolves recipients.

async function callQueue(payload) {
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };
  try {
    const fn = httpsCallable(getFunctions(), 'queueBusinessNotification');
    const res = await fn(payload);
    return { ok: true, queued: res?.data?.queued || 0 };
  } catch (e) {
    console.warn('queueBusinessNotification failed', e);
    return { ok: false, reason: e?.code || e?.message || 'queue_failed' };
  }
}

/** Partner just posted a pickup — fan out to the chapter. */
export function queuePickupBroadcast(pickupId, { title, body, url, data }) {
  return callQueue({
    scope: 'pickup', pickup_id: pickupId, intent: 'new_pickup_broadcast',
    kind: 'pickup', title, body, url, data,
  });
}
/** Claimant → partner (claim / enroute / completion). */
export function queuePickupToPartner(pickupId, { title, body, url, data }) {
  return callQueue({
    scope: 'pickup', pickup_id: pickupId, intent: 'to_partner',
    kind: 'pickup', title, body, url, data,
  });
}
/** Partner → claimant (verify / cancel / etc.). */
export function queuePickupToClaimant(pickupId, { title, body, url, data }) {
  return callQueue({
    scope: 'pickup', pickup_id: pickupId, intent: 'to_claimant',
    kind: 'pickup', title, body, url, data,
  });
}
/** Scoped broadcast to a chapter (president → own chapter; exec → any). */
export function queueChapterBroadcast(chapterId, { kind = 'broadcast', title, body, url, data }) {
  return callQueue({
    scope: 'broadcast', chapter_id: chapterId, kind, title, body, url, data,
  });
}
/** Event-chapter broadcast (pres of event's chapter or exec). */
export function queueEventBroadcast(eventId, { kind = 'volunteer', title, body, url, data }) {
  return callQueue({
    scope: 'event', event_id: eventId, kind, title, body, url, data,
  });
}

/**
 * Audience helper — convenience wrapper over queueChapterBroadcast.
 * Pre-A2 callers passed 'chapter:<id>'; we parse that form through.
 */
export async function enqueueAudienceNotification(opts) {
  const { audience, kind = 'broadcast', title, body, url, data } = opts;
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };
  if (typeof audience === 'string' && audience.startsWith('chapter:')) {
    return queueChapterBroadcast(audience.slice('chapter:'.length), { kind, title, body, url, data });
  }
  // 'bn' / 'all' / 'restaurants' are legacy global audiences — exec only.
  return callQueue({ scope: 'broadcast', chapter_id: '*', kind, title, body, url, data });
}
