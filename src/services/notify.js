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
import { collection, addDoc, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { prefKeyForKind } from '../config/notifications';

// Pulls a user doc once, then decides which channels are eligible
// for the given notification kind based on the user's preferences.
async function resolveChannels(uid, kind) {
  if (!uid) return { push: false, email: false, profile: null };
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { push: false, email: false, profile: null };
  const p = snap.data();
  const prefKey = prefKeyForKind(kind);
  const wantsKind = p[prefKey] !== false; // default true
  return {
    push:  wantsKind && p.push_enabled === true && !!p.onesignal_player_id,
    email: wantsKind && p.email_consent !== false && !!p.email,
    profile: p,
  };
}

// Drop one outbox doc per channel per recipient. Worker picks them up
// in batches and flips status to 'sent' / 'failed'.
async function dropOutbox({ uid, channel, payload }) {
  await addDoc(collection(db, 'notifications_outbox'), {
    user_id: uid,
    channel,                      // 'push' | 'email' | 'inapp'
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

  let push = 0, email = 0, inapp = 0, skipped = 0;

  for (const uid of recipients) {
    try {
      if (!skipInApp) {
        await dropInApp({ uid, kind, title, body, url });
        inapp += 1;
      }
      const ch = await resolveChannels(uid, kind);
      if (ch.push) {
        await dropOutbox({
          uid, channel: 'push',
          payload: {
            kind, title, body, url: url || null,
            data,
            target: 'onesignal',
            player_id: ch.profile.onesignal_player_id,
          },
        });
        push += 1;
      }
      if (ch.email) {
        await dropOutbox({
          uid, channel: 'email',
          payload: {
            kind, title, body, url: url || null,
            email: ch.profile.email,
            name: ch.profile.name || '',
          },
        });
        email += 1;
      }
      if (!ch.push && !ch.email && !skipInApp) skipped += 1;
    } catch (e) {
      console.warn('enqueueNotification per-user failure', uid, e);
    }
  }
  return { ok: true, push, email, inapp, skipped, total: recipients.length };
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
