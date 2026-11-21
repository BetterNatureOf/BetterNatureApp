// Unified notification dispatcher. Single function the rest of the
// app calls: enqueueNotification({ recipients, kind, title, body,
// url, data }). Writes one doc to `notifications_outbox` per
// recipient + channel. The Cloudflare Worker
// (workers/notification-dispatcher/) reads from the outbox and
// fans out to OneSignal (push) and Resend (email).
//
// Modular contract for the future React Native client: this file
// is platform-agnostic; native imports it unchanged and gets the
// same per-user routing without any extra plumbing.
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// Channel routing (push vs email, per-kind preferences) happens in the
// dispatcher worker, which reads the recipient's private profile with
// its service account. Clients can't read other members' profiles, and
// the rules stop a client from supplying an email / push id for a
// member — so every member-addressed outbox doc is channel 'auto'.
//
// Drop one outbox doc per channel per recipient. Worker picks them up
// in batches and flips status to 'sent' / 'failed'.
async function dropOutbox({ uid, channel, payload }) {
  await addDoc(collection(db, 'notifications_outbox'), {
    user_id: uid,
    channel,                      // 'auto' — dispatcher picks push and/or email
    status: 'queued',
    attempts: 0,
    ...payload,
    created_at: serverTimestamp(),
  });
}

// In-app notification (the bell). Always written so a user who
// has push + email turned off still sees the message next time
// they open the app.
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
 * @param {boolean=} opts.skipInApp       — for SMS-replacement broadcasts where caller wrote their own inapp row
 */
export async function enqueueNotification(opts) {
  const { recipients = [], kind = 'general', title, body, url, data = {}, skipInApp } = opts;
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };
  if (!title || !body) return { ok: false, reason: 'missing_content' };

  let queued = 0, inapp = 0;

  for (const uid of recipients) {
    try {
      if (!skipInApp) {
        await dropInApp({ uid, kind, title, body, url });
        inapp += 1;
      }
      await dropOutbox({
        uid, channel: 'auto',
        payload: { kind, title, body, url: url || null, data },
      });
      queued += 1;
    } catch (e) {
      console.warn('enqueueNotification per-user failure', uid, e);
    }
  }
  return { ok: true, queued, inapp, total: recipients.length };
}

// Convenience: pull every uid matching a target audience and queue.
//   audience:
//     'bn'          → role !== 'restaurant'
//     'restaurants' → role === 'restaurant'  (uses linked user_id when present)
//     'all'         → both
//     'chapter:<id>' → members of that chapter (role !== 'restaurant')
export async function enqueueAudienceNotification(opts) {
  const { audience, ...rest } = opts;
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };

  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const recipients = users
    .filter((u) => !u.deleted_at)
    .filter((u) => {
      if (audience === 'bn')          return (u.role || 'member') !== 'restaurant';
      if (audience === 'restaurants') return (u.role || 'member') === 'restaurant';
      if (audience === 'all')         return true;
      if (audience?.startsWith?.('chapter:'))
        return u.chapter_id === audience.slice('chapter:'.length) && (u.role || 'member') !== 'restaurant';
      return false;
    })
    .map((u) => u.id);

  return enqueueNotification({ recipients, ...rest });
}
