// Recurring donations. A schedule is a donor's saved template (food type,
// usual amount, destination preference) plus the days and local ready
// time it usually happens. Shortly before each occurrence the server
// creates ONE occurrence record (deterministic id: schedule + local date)
// and asks the donor to confirm the actual food, amount and readiness —
// or skip. Nothing is posted to partners or volunteers until the donor
// confirms. Times are computed in the schedule's timezone, so a daylight
// saving change keeps the local ready time.
//
// donation_schedules/{id}
//   restaurant_id, chapter_id, owner_uid, status: active | paused
//   days: ['mon', ...], ready_time: 'HH:MM', timezone (IANA)
//   window_hours (how long the food stays available after ready time)
//   template: { food_category, packages, estimated_weight_lbs, notes }
//   destination: { mode: network | preferred | coordinator, site_id, offer_to_network }
//   skip_dates: ['YYYY-MM-DD'], ends_on: 'YYYY-MM-DD' | null
// donation_occurrences/{scheduleId}_{YYYY-MM-DD}
//   status: awaiting_donor | confirmed | skipped | missed, ready_at, pickup_id
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v1/https');
const { latLngToCell } = require('h3-js');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LEAD_MS = 3 * 60 * 60_000;     // ask the donor up to 3 h before ready time
const MISS_AFTER_MS = 2 * 60 * 60_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Wall-clock parts of an instant in a timezone.
function zoned(atMs, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(atMs)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second,
    weekday: p.weekday.toLowerCase().slice(0, 3), date: `${p.year}-${p.month}-${p.day}` };
}

// The UTC instant of a local date + time in a timezone (DST-aware).
function localToUtc(date, hhmm, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const z = zoned(guess, timeZone);
    const asUtc = Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s);
    guess += Date.UTC(y, mo - 1, d, h, mi) - asUtc;
  }
  return guess;
}

function addDays(date, n) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

// Occurrences whose ready time falls in [from, to).
function occurrencesBetween(schedule, fromMs, toMs) {
  const tz = schedule.timezone || 'America/Chicago';
  if (!HHMM.test(schedule.ready_time || '') || !Array.isArray(schedule.days)) return [];
  const out = [];
  let date = zoned(fromMs - 24 * 3600_000, tz).date;
  for (let i = 0; i < 16; i++, date = addDays(date, 1)) {
    const readyAt = localToUtc(date, schedule.ready_time, tz);
    if (readyAt >= toMs) break;
    if (readyAt < fromMs) continue;
    const weekday = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    if (!schedule.days.includes(weekday)) continue;
    if ((schedule.skip_dates || []).includes(date)) continue;
    if (schedule.ends_on && date > schedule.ends_on) continue;
    out.push({ date, readyAt });
  }
  return out;
}

const occurrenceId = (scheduleId, date) => `${scheduleId}_${date}`;

function notice(tx, db, id, uid, title, body, data) {
  if (!uid) return;
  const row = { user_id: uid, kind: 'pickup', title, body, url: 'https://app.betternatureofficial.org/#/restaurant/recurring', data,
    created_at: FieldValue.serverTimestamp() };
  tx.set(db.collection('notifications').doc(id), { ...row, read: false });
  tx.set(db.collection('notifications_outbox').doc(id), { ...row, status: 'queued', attempts: 0, idempotency_key: id });
}

// Scheduler: create occurrences due soon; mark unconfirmed past ones missed.
async function materialize(db, { now = Date.now() } = {}) {
  const schedules = await db.collection('donation_schedules').where('status', '==', 'active').get();
  let created = 0, missed = 0;
  for (const s of schedules.docs) {
    const schedule = s.data();
    for (const occ of occurrencesBetween(schedule, now, now + LEAD_MS)) {
      const ref = db.collection('donation_occurrences').doc(occurrenceId(s.id, occ.date));
      const made = await db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return false;
        tx.create(ref, { schedule_id: s.id, restaurant_id: schedule.restaurant_id, chapter_id: schedule.chapter_id,
          owner_uid: schedule.owner_uid, date: occ.date, ready_at: Timestamp.fromMillis(occ.readyAt),
          status: 'awaiting_donor', template: schedule.template || {}, created_at: FieldValue.serverTimestamp() });
        notice(tx, db, `occ_${s.id}_${occ.date}`, schedule.owner_uid, 'Confirm today’s donation',
          `Your usual donation is due at ${new Date(occ.readyAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: schedule.timezone || 'America/Chicago' })}. Confirm what you actually have, or skip today.`,
          { type: 'donation_occurrence', scheduleId: s.id, date: occ.date });
        return true;
      });
      if (made) created++;
    }
  }
  const stale = await db.collection('donation_occurrences').where('status', '==', 'awaiting_donor')
    .where('ready_at', '<=', Timestamp.fromMillis(now - MISS_AFTER_MS)).limit(100).get();
  for (const d of stale.docs) { await d.ref.update({ status: 'missed', missed_at: FieldValue.serverTimestamp() }); missed++; }
  return { created, missed };
}

async function ownsRestaurant(db, restaurantId, uid) {
  if (!restaurantId || String(restaurantId).includes('/')) return false;
  if (restaurantId === uid) return true;
  return (await db.doc(`restaurants/${restaurantId}`).get()).data()?.user_id === uid;
}

// Donor confirms the actual donation for an occurrence (or skips it).
async function confirmOccurrence(db, data, uid, { now = Date.now(), requestPartner = null } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const id = typeof data?.occurrenceId === 'string' ? data.occurrenceId : '';
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'Choose a donation.');
  const ref = db.doc(`donation_occurrences/${id}`);
  const snap = await ref.get();
  const occ = snap.data();
  if (!occ) throw new HttpsError('not-found', 'Donation not found.');
  if (!(await ownsRestaurant(db, occ.restaurant_id, uid))) throw new HttpsError('permission-denied', 'Only the donor can confirm.');
  if (data?.skip === true) {
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (cur.status === 'skipped') return;
      if (cur.status !== 'awaiting_donor') throw new HttpsError('failed-precondition', 'This donation was already handled.');
      tx.update(ref, { status: 'skipped', skipped_by: uid, skip_reason: String(data?.reason || '').slice(0, 200), skipped_at: FieldValue.serverTimestamp() });
    });
    return { ok: true, skipped: true };
  }
  const weight = Number(data?.estimated_weight_lbs);
  const packages = data?.packages == null || data.packages === '' ? null : Number(data.packages);
  const readyHours = Number(data?.ready_for_hours ?? 3);
  if (!(weight > 0 && weight < 10000) || (packages !== null && !(Number.isInteger(packages) && packages > 0)) || !(readyHours >= 0.5 && readyHours <= 12)) {
    throw new HttpsError('invalid-argument', 'Enter the actual pounds (estimate), item count, and how long it’s available.');
  }
  const [schedule, restaurant] = await Promise.all([
    db.doc(`donation_schedules/${occ.schedule_id}`).get().then((d) => d.data() || {}),
    db.doc(`restaurants/${occ.restaurant_id}`).get().then((d) => d.data() || {}),
  ]);
  const pickupRef = db.collection('pickups').doc(`occ_${id}`);
  const created = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (cur.status === 'confirmed') return false;
    if (cur.status !== 'awaiting_donor') throw new HttpsError('failed-precondition', 'This donation was already handled.');
    const readyAt = Math.max(now, ms(cur.ready_at));
    const until = readyAt + readyHours * 3600_000;
    const lat = restaurant.lat ?? null, lng = restaurant.lng ?? null;
    tx.create(pickupRef, {
      status: 'pending_destination', claimed_by: null, restaurant_id: occ.restaurant_id, chapter_id: occ.chapter_id,
      restaurant_name: restaurant.name || '', restaurant_address: restaurant.address || '', restaurant_phone: restaurant.phone || '',
      restaurant_lat: lat, restaurant_lng: lng, restaurant_h3: Number.isFinite(lat) && Number.isFinite(lng) ? latLngToCell(lat, lng, 8) : null,
      estimated_weight_lbs: weight, weight_basis: 'estimate', packages, meals_estimate: Math.round(weight * 1.2),
      food_category: data?.food_category || cur.template?.food_category || null, notes: String(data?.notes ?? cur.template?.notes ?? '').slice(0, 500),
      pickup_window_until: new Date(until).toISOString(), scheduled_for: new Date(readyAt).toISOString(),
      occurrence_id: id, schedule_id: occ.schedule_id, created_by: uid, created_at: FieldValue.serverTimestamp(),
    });
    tx.update(ref, { status: 'confirmed', pickup_id: pickupRef.id, confirmed_by: uid, confirmed_at: FieldValue.serverTimestamp(),
      actual: { estimated_weight_lbs: weight, packages, food_category: data?.food_category || null } });
    return true;
  });
  if (created && schedule.destination?.mode && schedule.destination.mode !== 'coordinator' && requestPartner) {
    await requestPartner(db, { pickupId: pickupRef.id, mode: schedule.destination.mode, siteId: schedule.destination.site_id || null,
      offerToNetwork: schedule.destination.offer_to_network === true }, uid, { now }).catch((e) => console.warn('partner request for occurrence', e.message));
  }
  return { ok: true, pickupId: pickupRef.id, cached: !created };
}

function ms(v) { return v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : Number(v); }

module.exports = { occurrencesBetween, localToUtc, materialize, confirmOccurrence, occurrenceId, LEAD_MS };
