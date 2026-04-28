// Live counters for the marketing website. Reads org_stats/global from
// Firestore — the same doc the app updates whenever a pickup is completed
// or a volunteer is checked in. Returns zeroes if the doc doesn't exist
// yet so we never lie about numbers we haven't earned.
import { db } from './firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export async function fetchOrgStats() {
  try {
    const snap = await getDoc(doc(db, 'org_stats', 'global'));
    if (!snap.exists()) return zeros();
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
  } catch (e) {
    console.warn('org stats fetch failed', e);
    return zeros();
  }
}

function zeros() {
  return { meals: 0, lbs: 0, individuals: 0, co2: 0, water: 0, events: 0, hours: 0 };
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
    { value: fmt(s.meals), label: 'meal kits delivered' },
    { value: `${fmt(s.lbs)} lbs`, label: 'food rescued' },
    { value: fmt(s.individuals), label: 'individuals served' },
    { value: `${fmt(s.co2)} lbs`, label: 'CO₂ avoided' },
    { value: `${fmt(s.water)} gal`, label: 'water footprint reduced' },
  ];
}

// Same shape as `impact.stats` in content.js.
export function statsToImpactCards(s) {
  return [
    { value: fmt(s.meals), label: 'Meal kits delivered', sublabel: 'From rescued surplus to neighbors who need them' },
    { value: fmt(s.lbs), label: 'Pounds of food rescued', sublabel: 'Direct from partner kitchens to recipients' },
    { value: fmt(s.individuals), label: 'Individuals served', sublabel: 'Across our active chapters' },
    { value: fmt(s.co2), label: 'Pounds of CO₂ avoided', sublabel: 'Emissions prevented by diverting food from landfills' },
    { value: fmt(s.water), label: 'Gallons of water saved', sublabel: 'Embedded water footprint of the food we rescued' },
    { value: fmt(s.events), label: 'Events run', sublabel: 'Pickups, cleanups, and chapter actions to date' },
  ];
}
