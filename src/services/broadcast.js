// Org-wide broadcast — writes the announcement, drops a notification
// onto every recipient's bell, and enqueues an SMS for anyone with
// a phone + sms_consent. Returns counts for the success message.
//
// audience:
//   'bn'          → every member + chapter pres + exec (skip restaurants)
//   'restaurants' → every restaurant partner (status: 'approved')
//   'all'         → both
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { enqueueSMS } from './sms';

function looksLikeMember(u) {
  const role = (u.role || 'member').toLowerCase();
  return role !== 'restaurant';
}

export async function sendBroadcast({ title, message, audience, sentBy }) {
  if (!isFirebaseConfigured) {
    return { ok: false, reason: 'firebase_not_configured' };
  }
  if (!title?.trim() || !message?.trim()) {
    return { ok: false, reason: 'missing_content' };
  }

  // 1) Persistent announcement row for the in-app archive.
  await addDoc(collection(db, 'announcements'), {
    title: title.trim(),
    message: message.trim(),
    target: audience,
    sent_by: sentBy || null,
    created_at: serverTimestamp(),
  });

  // 2) Recipients.
  const recipients = [];
  if (audience === 'bn' || audience === 'all') {
    const usnap = await getDocs(collection(db, 'users'));
    usnap.docs.forEach((d) => {
      const u = { id: d.id, ...d.data() };
      if (!u.deleted_at && looksLikeMember(u)) recipients.push({
        kind: 'user',
        id: u.id,
        phone: u.phone,
        sms_consent: u.sms_consent,
      });
    });
  }
  if (audience === 'restaurants' || audience === 'all') {
    const rsnap = await getDocs(collection(db, 'restaurants'));
    rsnap.docs.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      if (r.status !== 'approved') return;
      recipients.push({
        kind: 'restaurant',
        id: r.id,
        user_id: r.user_id || null,
        phone: r.phone,
        // Restaurants opted in at contract signing too.
        sms_consent: r.sms_consent !== false,
      });
    });
  }

  // 3) In-app notification per recipient. Restaurants only get
  // one when we know which uid to deliver it to (r.user_id was
  // stamped at signup).
  const writes = [];
  recipients.forEach((r) => {
    const uid = r.kind === 'restaurant' ? r.user_id : r.id;
    if (!uid) return;
    writes.push(addDoc(collection(db, 'notifications'), {
      user_id: uid,
      kind: 'broadcast',
      title: title.trim(),
      body: message.trim(),
      read: false,
      created_at: serverTimestamp(),
    }).catch((e) => console.warn('notif write failed', e)));
  });
  await Promise.all(writes);

  // 4) Outbox SMS for everyone with a phone + consent.
  const smsBody = `BetterNature — ${title.trim()}\n\n${message.trim()}\n\nReply STOP to opt out.`;
  let smsCount = 0;
  await Promise.all(recipients.map(async (r) => {
    if (!r.phone || r.sms_consent === false) return;
    const id = await enqueueSMS({
      to: r.phone,
      body: smsBody,
      kind: 'broadcast',
    });
    if (id) smsCount += 1;
  }));

  return {
    ok: true,
    audience,
    notifyCount: writes.length,
    smsCount,
    totalRecipients: recipients.length,
  };
}
