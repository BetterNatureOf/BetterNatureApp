// Single source of truth for the live counters shown on the marketing
// website hero ticker, the impact section, and the in-app impact screen.
//
// We keep a Firestore doc at `org_stats/global` with running totals so
// every surface can read the same numbers in O(1) — no aggregation needed
// at read time. Every time a real impact event happens (a volunteer is
// checked in, a pickup is completed, a donation is recorded), call
// bumpOrgStats() to atomically update the doc.
//
// Multipliers used (matched to the marketing site):
//   1 lb of food rescued      → 1.2 meal kits
//   1 lb of food rescued      → 3.8 lbs CO₂ avoided
//   1 lb of food rescued      → 175 gallons water footprint saved
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

const STATS_DOC = 'org_stats/global';

// Pull current totals. Returns zeroes when the doc doesn't exist yet so
// the website renders a real "we're just starting" state, not fake numbers.
export async function getOrgStats() {
  if (!isFirebaseConfigured) {
    return { meals: 0, lbs: 0, individuals: 0, co2: 0, water: 0, events: 0, hours: 0 };
  }
  const snap = await getDoc(doc(db, 'org_stats', 'global'));
  if (!snap.exists()) {
    return { meals: 0, lbs: 0, individuals: 0, co2: 0, water: 0, events: 0, hours: 0 };
  }
  const d = snap.data();
  return {
    meals: d.meals || 0,
    lbs: d.lbs || 0,
    individuals: d.individuals || 0,
    co2: d.co2 || 0,
    water: d.water || 0,
    events: d.events || 0,
    hours: d.hours || 0,
  };
}

// Atomically bump one or more counters. All deltas are optional.
// `lbs` automatically derives meals/co2/water if those weren't passed,
// so callers can just say "I rescued X lbs" and the rest computes.
export async function bumpOrgStats({
  meals,
  lbs,
  individuals,
  co2,
  water,
  events,
  hours,
} = {}) {
  if (!isFirebaseConfigured) return;
  const updates = { updated_at: serverTimestamp() };

  if (lbs) {
    updates.lbs = increment(lbs);
    if (meals === undefined) updates.meals = increment(Math.round(lbs * 1.2));
    if (co2 === undefined) updates.co2 = increment(Math.round(lbs * 3.8));
    if (water === undefined) updates.water = increment(Math.round(lbs * 175));
  }
  if (meals !== undefined && lbs === undefined) updates.meals = increment(meals);
  if (co2 !== undefined && lbs === undefined) updates.co2 = increment(co2);
  if (water !== undefined && lbs === undefined) updates.water = increment(water);
  if (individuals) updates.individuals = increment(individuals);
  if (events) updates.events = increment(events);
  if (hours) updates.hours = increment(hours);

  // setDoc with merge so the doc is created on first call.
  await setDoc(doc(db, 'org_stats', 'global'), updates, { merge: true });
}
