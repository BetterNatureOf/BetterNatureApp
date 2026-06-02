// SMS notification scaffold.
//
// We use TextBelt instead of Twilio because:
//   • Single REST endpoint — no SDK to install or upgrade
//   • Free tier (key="textbelt") sends 1 SMS/day from anywhere — good
//     for end-to-end testing without paying anything
//   • Pay-as-you-go credits when you outgrow the free tier; no monthly
//     phone-number rental ($0 base) and ~$0.0035 per SMS (vs. $0.0075
//     on Twilio)
//   • API takes plain phone + message + key — that's it
//
// The dispatch still happens server-side (Cloud Function / Cloudflare
// Worker) so we never ship the API key in the client. This module:
//   1. Decides WHEN a reminder should fire (smart logic based on when
//      the volunteer claimed vs. when the pickup window closes).
//   2. Writes an "sms_outbox" Firestore doc with {to, body, send_at,
//      provider, kind, ref_id}. The dispatcher reads new docs and
//      POSTs them to TextBelt.
//
// To turn it on:
//   1. Visit textbelt.com → "Get an API key" → purchase $5-10 of
//      credits (~1500-3000 SMS) or use 'textbelt' for one daily test
//   2. Deploy the sms-dispatcher Cloud Function or Cloudflare Worker
//   3. Set TEXTBELT_KEY in the function env. Done.
//
// Until then, enqueue() still writes the outbox doc — it just sits
// there. No errors, no missed events.
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
// `to` is a phone (we normalize to E.164). Body is the message.
// `sendAt` is optional; if absent the dispatcher sends immediately.
export async function enqueueSMS({ to, body, sendAt, kind, refId, provider = 'textbelt' }) {
  if (!isFirebaseConfigured) return null;
  if (!to || !body) return null;
  const e164 = normalizeE164(to);
  if (!e164) return null;
  // TextBelt accepts up to 160 chars per SMS segment cheaply; long
  // messages incur per-segment charges. Trim politely.
  const trimmed = body.length > 320 ? body.slice(0, 317) + '...' : body;
  try {
    const ref = await addDoc(collection(db, 'sms_outbox'), {
      to: e164,
      body: trimmed,
      send_at: sendAt ? sendAt.toISOString() : null,  // null = send now
      provider,                                        // 'textbelt' default
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
