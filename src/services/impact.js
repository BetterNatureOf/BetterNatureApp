// Presentation layer for translating pounds of rescued food into the
// numbers a human actually feels — meals, family-days, CO2, water.
//
// The core lbs → meals/CO2/water multipliers live in orgStats.js so
// this module never drifts from the values we already report on the
// website ticker and every tax receipt. Family-days is defined here
// because it's only a display concept (3 meals ≈ one 3-person
// household fed for a day) and doesn't need to be persisted anywhere.
//
// Rule of thumb we use (Feeding America / USDA baselines):
//   1 lb of food rescued → 1.2 meals
//   1 family-day fed     = 3 meals

import { MEALS_PER_LB, CO2_LB_PER_LB, WATER_GAL_PER_LB } from './orgStats';

const MEALS_PER_FAMILY_DAY = 3;

function n(x) { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; }
function fmt(x) { return Math.round(x).toLocaleString('en-US'); }

export function mealsFromLbs(lbs)       { return Math.round(n(lbs) * MEALS_PER_LB); }
export function familyDaysFromLbs(lbs)  { return Math.round((n(lbs) * MEALS_PER_LB) / MEALS_PER_FAMILY_DAY); }
export function co2FromLbs(lbs)         { return Math.round(n(lbs) * CO2_LB_PER_LB); }
export function waterGalFromLbs(lbs)    { return Math.round(n(lbs) * WATER_GAL_PER_LB); }

// Short one-liner — "≈ 336 meals · 112 family-days"
export function impactLine(lbs) {
  const l = n(lbs);
  if (l <= 0) return '';
  return `≈ ${fmt(mealsFromLbs(l))} meals · ${fmt(familyDaysFromLbs(l))} family-days`;
}

// Four-tile version — for tax receipts and impact summaries.
export function impactTiles(lbs) {
  const l = n(lbs);
  return [
    { key: 'meals',   label: 'Meals',           value: fmt(mealsFromLbs(l)) },
    { key: 'family',  label: 'Family-days fed', value: fmt(familyDaysFromLbs(l)) },
    { key: 'co2',     label: 'Lbs CO₂ avoided', value: fmt(co2FromLbs(l)) },
    { key: 'water',   label: 'Gal water saved', value: fmt(waterGalFromLbs(l)) },
  ];
}

// "Feeds about 6 families for a day" — for the schedule form. Falls
// back to a meals-only phrasing under a family-day so we never print
// "0 families".
export function humanImpactPhrase(lbs) {
  const l = n(lbs);
  if (l <= 0) return '';
  const families = familyDaysFromLbs(l);
  if (families >= 1) return `Feeds about ${fmt(families)} famil${families === 1 ? 'y' : 'ies'} for a day.`;
  const meals = mealsFromLbs(l);
  if (meals >= 1) return `About ${fmt(meals)} meal${meals === 1 ? '' : 's'}.`;
  return '';
}
