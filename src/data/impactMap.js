// ═══════════════════════════════════════════════════════════════════════════
//  BETTER NATURE — IMPACT MAP DATA (App)
//
//  Mirrors website/impact-map-data.js. Same layer vocabulary, same colors,
//  same gap research — so the app map and the marketing map tell one story.
//
//  Static layer (here): chapters + recruitment-gap cities. Hard-coded
//  because they don't change per-pickup.
//
//  Live layer: community fridges. Pulled from Firestore at runtime via
//  loadLiveFridges() so the same network appears on the marketing map
//  and inside the app.
// ═══════════════════════════════════════════════════════════════════════════
import { listFridges } from '../services/fridges';

export const LAYERS = [
  { key: 'chapter', label: 'Chapters',          color: '#1B3A2D' },
  { key: 'fridge',  label: 'Community fridges', color: '#2E7D32' },
  { key: 'gap',     label: 'The Gap',           color: '#FF4D8D' },
];

export const COPY = {
  eyebrow: "Where we work. Where we don't.",
  title: 'The impact map.',
  body:
    "Every green pin is a chapter or a community fridge in our drop-off network. " +
    "Every pink pin is a city where 1 in 6 people are food insecure and we " +
    "haven't shown up yet. That's the gap.",
};

// Real chapters only. No inflated stats — aggregates come from live
// org_stats / chapter docs, not from this constant. `country` uses
// ISO 3166-1 alpha-3 (USA, IND, GBR, ...) so the world choropleth
// can roll BN presence up by country without a name-matching mess.
export const POINTS = [
  { kind: 'chapter', city: 'Memphis', state: 'TN', country: 'USA', lat: 35.1495, lng: -90.0490 },

  // The Gap — high food-insecurity cities we haven't covered yet.
  // Insecurity figures: Feeding America's Map the Meal Gap (US),
  // FAO + national surveys for international cities.
  { kind: 'gap', city: 'Detroit',      state: 'MI', country: 'USA', lat: 42.3314, lng: -83.0458,  insecurity: 21.4 },
  { kind: 'gap', city: 'Cleveland',    state: 'OH', country: 'USA', lat: 41.4993, lng: -81.6944,  insecurity: 20.8 },
  { kind: 'gap', city: 'Baltimore',    state: 'MD', country: 'USA', lat: 39.2904, lng: -76.6122,  insecurity: 19.2 },
  { kind: 'gap', city: 'Milwaukee',    state: 'WI', country: 'USA', lat: 43.0389, lng: -87.9065,  insecurity: 18.7 },
  { kind: 'gap', city: 'St. Louis',    state: 'MO', country: 'USA', lat: 38.6270, lng: -90.1994,  insecurity: 19.9 },
  { kind: 'gap', city: 'Jackson',      state: 'MS', country: 'USA', lat: 32.2988, lng: -90.1848,  insecurity: 23.1 },
  { kind: 'gap', city: 'Birmingham',   state: 'AL', country: 'USA', lat: 33.5186, lng: -86.8104,  insecurity: 21.6 },
  { kind: 'gap', city: 'New Orleans',  state: 'LA', country: 'USA', lat: 29.9511, lng: -90.0715,  insecurity: 22.3 },
  { kind: 'gap', city: 'Fresno',       state: 'CA', country: 'USA', lat: 36.7378, lng: -119.7871, insecurity: 17.3 },
  { kind: 'gap', city: 'Albuquerque',  state: 'NM', country: 'USA', lat: 35.0844, lng: -106.6504, insecurity: 16.9 },
  { kind: 'gap', city: 'Philadelphia', state: 'PA', country: 'USA', lat: 39.9526, lng: -75.1652,  insecurity: 18.4 },
  { kind: 'gap', city: 'Tucson',       state: 'AZ', country: 'USA', lat: 32.2226, lng: -110.9747, insecurity: 15.8 },

  // International gap cities — high-insecurity metros without a
  // BetterNature chapter yet. As we open more chapters abroad, these
  // get replaced with `kind: 'chapter'` entries.
  { kind: 'gap', city: 'Port-au-Prince', state: 'Ouest',     country: 'HTI', lat: 18.5944, lng: -72.3074, insecurity: 82.0 },
  { kind: 'gap', city: 'Nairobi',        state: 'Nairobi',   country: 'KEN', lat: -1.2921, lng:  36.8219, insecurity: 75.0 },
  { kind: 'gap', city: 'Lagos',          state: 'Lagos',     country: 'NGA', lat:  6.5244, lng:   3.3792, insecurity: 70.7 },
  { kind: 'gap', city: 'Sanaa',          state: 'Amanat',    country: 'YEM', lat: 15.3694, lng:  44.1910, insecurity: 80.0 },
  { kind: 'gap', city: 'Caracas',        state: 'Capital',   country: 'VEN', lat: 10.4806, lng: -66.9036, insecurity: 78.0 },
  { kind: 'gap', city: 'Guatemala City', state: 'Guatemala', country: 'GTM', lat: 14.6349, lng: -90.5069, insecurity: 53.0 },
  { kind: 'gap', city: 'Manila',         state: 'NCR',       country: 'PHL', lat: 14.5995, lng: 120.9842, insecurity: 51.0 },
  { kind: 'gap', city: 'Dhaka',          state: 'Dhaka',     country: 'BGD', lat: 23.8103, lng:  90.4125, insecurity: 32.0 },
  { kind: 'gap', city: 'Kabul',          state: 'Kabul',     country: 'AFG', lat: 34.5553, lng:  69.2075, insecurity: 40.0 },
  { kind: 'gap', city: 'São Paulo',      state: 'SP',        country: 'BRA', lat: -23.5505, lng: -46.6333, insecurity: 30.1 },
];

// Pull every active fridge from Firestore. Used by ImpactMap to merge
// live fridges with the static chapter + gap data.
export async function loadLiveFridges() {
  try {
    const fridges = await listFridges();
    return fridges
      .filter((f) => f.lat != null && f.lng != null)
      .map((f) => ({ kind: 'fridge', ...f }));
  } catch (e) {
    console.warn('loadLiveFridges failed', e);
    return [];
  }
}

export function aggregate(points) {
  return {
    chapters: points.filter((p) => p.kind === 'chapter').length,
    fridges:  points.filter((p) => p.kind === 'fridge').length,
    gaps:     points.filter((p) => p.kind === 'gap').length,
  };
}
