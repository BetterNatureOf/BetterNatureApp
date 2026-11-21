// Bumps the public org_stats/global counters (website ticker, Welcome
// screen, exec dashboard) for event check-ins and volunteer signups,
// so no client writes them. Pickup completions are counted inside the
// completePickupOperation transaction (completePickup.js).
//
// Each source is applied at most once: a marker doc in
// org_stats_applied/{key} is created in the same transaction as the bump.
const { FieldValue } = require('firebase-admin/firestore');

// Mirrors src/services/orgStats.js.
const MEALS_PER_LB = 1.2;
const CO2_LB_PER_LB = 3.8;
const WATER_GAL_PER_LB = 175;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function deltasFor({ lbs = 0, meals, hours = 0, events = 0, volunteers = 0 }) {
  const d = {};
  if (lbs) {
    d.lbs = lbs;
    d.meals = meals ?? Math.round(lbs * MEALS_PER_LB);
    d.co2 = Math.round(lbs * CO2_LB_PER_LB);
    d.water = Math.round(lbs * WATER_GAL_PER_LB);
  } else if (meals) {
    d.meals = meals;
  }
  if (hours) d.hours = hours;
  if (events) d.events = events;
  if (volunteers) d.volunteers = volunteers;
  return d;
}

async function applyOnce(db, key, deltas) {
  const entries = Object.entries(deltas).filter(([, v]) => v);
  if (!entries.length) return false;
  const marker = db.collection('org_stats_applied').doc(key);
  const stats = db.collection('org_stats').doc('global');
  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return false;
    const update = { updated_at: FieldValue.serverTimestamp() };
    for (const [k, v] of entries) update[k] = FieldValue.increment(v);
    tx.set(stats, update, { merge: true });
    tx.create(marker, { deltas, applied_at: FieldValue.serverTimestamp() });
    return true;
  });
}

// member_activity/{id} create with source_type 'event_checkin'
function eventCheckedIn(db, activityId, row) {
  if (row?.source_type !== 'event_checkin') return null;
  return applyOnce(db, `activity_${activityId}`, deltasFor({
    meals: num(row.meals), hours: num(row.hours), events: 1,
  }));
}

// users/{uid} create — only member volunteers move the counter
function volunteerSignedUp(db, uid, user) {
  if ((user?.role || 'member') !== 'member') return null;
  return applyOnce(db, `signup_${uid}`, { volunteers: 1 });
}

module.exports = { deltasFor, applyOnce, eventCheckedIn, volunteerSignedUp };
