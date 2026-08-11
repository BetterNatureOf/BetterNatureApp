// Live counters for the marketing website. Reads org_stats/global from
// Firestore — the same doc the app updates whenever a pickup is completed
// or a volunteer is checked in.
//
// FLOORED at the same baseline the app publishes (src/services/orgStats.js
// BASELINE). Reason: on a fresh page load, a Firestore doc that's
// missing individual fields (or hasn't been fully written yet by the
// dispatcher worker) would render as literal "0" for those fields —
// user reported "zeros flash on first load, real numbers on reload."
// Now the floor guarantees the site never renders lower than our
// publicly-reported totals, so the worst case is "baseline" not "0".
import { db } from './firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Must match src/services/orgStats.js BASELINE constant. If we update
// public reporting numbers, bump both in the same commit or the app
// and website drift apart.
const BASELINE = {
  meals: 6963,
  individuals: 6963,
  lbs: 2780,
  co2: 10564,
  water: 486500,
  events: 0,
  hours: 0,
  volunteers: 0,
};

export async function fetchOrgStats() {
  try {
    const snap = await getDoc(doc(db, 'org_stats', 'global'));
    const d = snap.exists() ? snap.data() : {};
    return {
      meals:       Math.max(BASELINE.meals,       d.meals       || 0),
      lbs:         Math.max(BASELINE.lbs,         d.lbs         || 0),
      individuals: Math.max(BASELINE.individuals, d.individuals || 0),
      co2:         Math.max(BASELINE.co2,         d.co2         || 0),
      water:       Math.max(BASELINE.water,       d.water       || 0),
      events:      Math.max(BASELINE.events,      d.events      || 0),
      hours:       Math.max(BASELINE.hours,       d.hours       || 0),
      volunteers:  Math.max(BASELINE.volunteers,  d.volunteers  || 0),
    };
  } catch (e) {
    console.warn('org stats fetch failed', e);
    // Even on network failure, fall back to baseline so the ticker
    // never renders zeros. Every visible number is a real total we've
    // publicly claimed.
    return { ...BASELINE };
  }
}

// Format a number for display. 0 → "0", small numbers as-is, larger with commas.
function fmt(n) {
  if (!n || n < 1000) return String(n || 0);
  return n.toLocaleString('en-US');
}

// Build the same shape as the static `tickerStats` array in content.js so
// the existing renderer can drop these in unchanged.
export function statsToTicker(s) {
  return [
    { value: fmt(s.volunteers), label: 'volunteers' },
    { value: `${fmt(s.lbs)} lbs`, label: 'food rescued' },
    { value: fmt(s.individuals), label: 'individuals served' },
    { value: `${fmt(s.co2)} lbs`, label: 'CO₂ avoided' },
    { value: `${fmt(s.water)} gal`, label: 'water footprint reduced' },
  ];
}

// Same shape as `impact.stats` in content.js.
export function statsToImpactCards(s) {
  return [
    { value: fmt(s.volunteers), label: 'Volunteers', sublabel: 'Active members across every chapter' },
    { value: fmt(s.lbs), label: 'Pounds of food rescued', sublabel: 'Direct from partner kitchens to recipients' },
    { value: fmt(s.individuals), label: 'Individuals served', sublabel: 'Across our active chapters' },
    { value: fmt(s.co2), label: 'Pounds of CO₂ avoided', sublabel: 'Emissions prevented by diverting food from landfills' },
    { value: fmt(s.water), label: 'Gallons of water saved', sublabel: 'Embedded water footprint of the food we rescued' },
  ];
}
