// SMS notification scaffold.
//
// The actual send happens server-side (Cloud Function / Cloudflare
// Worker) so we don't ship API secrets to the client. This client-side
// module only:
//   1. Decides WHEN a reminder should fire (smart logic based on when
//      the volunteer claimed vs. when the pickup window closes).
//   2. Writes a "sms_outbox" Firestore doc with {to, body, send_at}.
//      The server function listens for new outbox docs and forwards
//      them to Twilio (or whatever provider is configured server-side).
//
// To turn it on:
//   1. Sign up for Twilio (or any SMS provider that supports webhooks)
//   2. Buy a phone number ($1/mo + ~$0.008 per SMS)
//   3. Deploy functions/sms-dispatcher (needs Firebase Blaze plan)
//   4. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM in the
//      function's env. Done.
//
// Until then, every enqueue() call still writes the outbox doc — it
// just sits there waiting. No-op gracefully if firebase isn't ready.
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// --- Reminder timing logic ------------------------------------------
// Goal: a single useful reminder, not multiple pings.
//
//   - If the pickup window is < 2 hours away when the volunteer
//     claims, NO reminder — the claim itself IS the reminder.
//   - If they claimed >24h before pickup, remind 24h before.
//   - If they claimed 2h–24h before pickup, remind 2h before.
//   - Past pickups never trigger reminders.

export function computeReminderTime({ claimedAt, pickupWindowUntil }) {
  if (!claimedAt || !pickupWindowUntil) return null;
  const claim = new Date(claimedAt).getTime();
  const pick  = new Date(pickupWindowUntil).getTime();
  const hoursUntil = (pick - claim) / 36e5;

  if (hoursUntil <= 2)  return null;            // claim is reminder enough
  if (hoursUntil > 24)  return new Date(pick - 24 * 36e5);
  return new Date(pick - 2 * 36e5);
}

// --- Outbox writer ---------------------------------------------------
// `to` is an E.164 phone (+15551234567). Body is the message text.
// `sendAt` is optional; if absent the dispatcher sends immediately.
export async function enqueueSMS({ to, body, sendAt, kind, refId }) {
  if (!isFirebaseConfigured) return null;
  if (!to || !body) return null;
  const e164 = normalizeE164(to);
  if (!e164) return null;
  try {
    const ref = await addDoc(collection(db, 'sms_outbox'), {
      to: e164,
      body,
      send_at: sendAt ? sendAt.toISOString() : null,  // null = send now
      kind: kind || 'misc',                            // grouping for analytics
      ref_id: refId || null,                           // e.g. pickup id
      status: 'queued',                                // dispatcher flips this
      attempts: 0,
      created_at: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.warn('enqueueSMS failed', e);
    return null;
  }
}

// US phone normalization. Returns "+1XXXXXXXXXX" or null.
function normalizeE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw && String(raw).startsWith('+')) return String(raw);
  return null;
}
