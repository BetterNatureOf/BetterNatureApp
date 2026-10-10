// Unified notification dispatcher — client-side half.
//
// A2 refactor: the client used to read each recipient's /users/{uid}
// doc here to pull push tokens, email and preferences, then stuffed
// those into the outbox doc. That cross-user profile read is now
// denied by the A2 rules (and it was always a leak — any signed-in
// user could enumerate push tokens by calling enqueueNotification).
//
// New contract: the client writes ONE outbox doc per recipient with
// recipient uid + content only. The Cloudflare Worker in
// workers/notification-dispatcher/ resolves the recipient's channels
// server-side with service-account creds, fans out to push + email,
// and flips status.
//
// In-app notifications still fire directly from the client via
// /notifications create (the bell), because the recipient reading
// their own doc is authorized by rules.
import { collection, addDoc, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

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

// One queued row per recipient. The dispatcher owns channel fan-out,
// recipient lookup, and preference checking.
async function dropOutbox({ uid, kind, title, body, url, data }) {
  await addDoc(collection(db, 'notifications_outbox'), {
    user_id: uid,
    kind,                           // 'pickup' | 'volunteer' | 'general' | ...
    title,
    body,
    url: url || null,
    data: data || {},
    status: 'queued',
    attempts: 0,
    created_at: serverTimestamp(),
  });
}

/**
 * The one public API every other service calls.
 *
 * @param {Object} opts
 * @param {string[]} opts.recipients      — uids
 * @param {string}   opts.kind            — 'pickup' | 'volunteer' | 'general' | 'broadcast' | 'welcome'
 * @param {string}   opts.title
 * @param {string}   opts.body
 * @param {string=}  opts.url             — deep link / web URL
 * @param {Object=}  opts.data            — payload merged into push data
 * @param {boolean=} opts.skipInApp       — for broadcasts where caller wrote their own inapp row
 */
export async function enqueueNotification(opts) {
  const { recipients = [], kind = 'general', title, body, url, data = {}, skipInApp } = opts;
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };
  if (!title || !body) return { ok: false, reason: 'missing_content' };

  let outbox = 0, inapp = 0;
  for (const uid of recipients) {
    if (!uid) continue;
    try {
      if (!skipInApp) {
        await dropInApp({ uid, kind, title, body, url });
        inapp += 1;
      }
      await dropOutbox({ uid, kind, title, body, url, data });
      outbox += 1;
    } catch (e) {
      console.warn('enqueueNotification per-user failure', uid, e);
    }
  }
  return { ok: true, outbox, inapp, total: recipients.length };
}

// Convenience: pull every uid matching a target audience and queue.
//   audience:
//     'bn'          → role_label !== 'partner'
//     'restaurants' → role_label === 'partner'
//     'all'         → both
//     'chapter:<id>' → public_profiles with that chapter_id (volunteers only)
//
// A2 note: reads from /public_profiles (open collection), not /users.
// Previously enumerated /users which is now denied for non-execs.
// Admins calling this still work the same way (public profile has the
// role_label we need).
export async function enqueueAudienceNotification(opts) {
  const { audience, ...rest } = opts;
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };

  const snap = await getDocs(collection(db, 'public_profiles'));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const recipients = users
    .filter((u) => {
      const label = u.role_label || 'member';
      if (audience === 'bn')          return label !== 'partner';
      if (audience === 'restaurants') return label === 'partner';
      if (audience === 'all')         return true;
      if (audience?.startsWith?.('chapter:'))
        return u.chapter_id === audience.slice('chapter:'.length) && label !== 'partner';
      return false;
    })
    .map((u) => u.uid || u.id);

  return enqueueNotification({ recipients, ...rest });
}
