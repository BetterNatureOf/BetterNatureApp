// Org-wide broadcast. Routes through the unified notify service so
// every recipient gets in-app + push (if enabled) + email (if opted
// in) — no more SMS.
//
// audience:
//   'bn'          → every member + chapter pres + exec (skip restaurants)
//   'restaurants' → every restaurant partner (status: 'approved')
//   'all'         → both
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { enqueueNotification } from './notify';

function looksLikeMember(u) {
  return (u.role || 'member').toLowerCase() !== 'restaurant';
}

export async function sendBroadcast({ title, message, audience, sentBy, chapterId = null }) {
  if (!isFirebaseConfigured) return { ok: false, reason: 'firebase_not_configured' };
  if (!title?.trim() || !message?.trim()) return { ok: false, reason: 'missing_content' };

  // 1) Persistent announcement row for the in-app archive. chapter_id
  // stamped when a president sent it so firestore.rules can verify
  // the writer was president of THIS chapter, not someone else's.
  await addDoc(collection(db, 'announcements'), {
    title: title.trim(),
    message: message.trim(),
    target: audience,
    chapter_id: chapterId,
    sent_by: sentBy || null,
    created_at: serverTimestamp(),
  });

  // 2) Recipient uids. If chapterId is set, only members of that
  // chapter receive — a president cannot broadcast to other chapters.
  const recipients = [];
  if (audience === 'bn' || audience === 'all') {
    const usnap = await getDocs(collection(db, 'users'));
    usnap.docs.forEach((d) => {
      const u = { id: d.id, ...d.data() };
      if (!u.deleted_at && looksLikeMember(u)
          && (!chapterId || u.chapter_id === chapterId)) {
        recipients.push(u.id);
      }
    });
  }
  if (audience === 'restaurants' || audience === 'all') {
    const rsnap = await getDocs(collection(db, 'restaurants'));
    rsnap.docs.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      if (r.status !== 'approved') return;
      if (chapterId && r.chapter_id !== chapterId) return;
      // Restaurants live in `users` too (signup creates a Firebase Auth
      // user). r.user_id is stamped at signup; fall back to r.id if not.
      recipients.push(r.user_id || r.id);
    });
  }

  // 3) Fan out via the dispatcher.
  const result = await enqueueNotification({
    recipients,
    kind: 'broadcast',
    title: title.trim(),
    body: message.trim(),
    url: 'https://app.betternatureofficial.org/#/notifications',
  });

  return {
    ok: true,
    audience,
    inappCount: result.inapp,
    pushCount: result.push,
    emailCount: result.email,
    skipped: result.skipped,
    totalRecipients: recipients.length,
  };
}
