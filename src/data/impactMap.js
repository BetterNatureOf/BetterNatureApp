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
// org_stats / chapter docs, not from this constant.
export const POINTS = [
  { kind: 'chapter', city: 'Memphis', state: 'TN', lat: 35.1495, lng: -90.0490 },

  // The Gap — high food-insecurity cities we haven't covered yet.
  // Insecurity figures: Feeding America's Map the Meal Gap.
  { kind: 'gap', city: 'Detroit',      state: 'MI', lat: 42.3314, lng: -83.0458,  insecurity: 21.4 },
  { kind: 'gap', city: 'Cleveland',    state: 'OH', lat: 41.4993, lng: -81.6944,  insecurity: 20.8 },
  { kind: 'gap', city: 'Baltimore',    state: 'MD', lat: 39.2904, lng: -76.6122,  insecurity: 19.2 },
  { kind: 'gap', city: 'Milwaukee',    state: 'WI', lat: 43.0389, lng: -87.9065,  insecurity: 18.7 },
  { kind: 'gap', city: 'St. Louis',    state: 'MO', lat: 38.6270, lng: -90.1994,  insecurity: 19.9 },
  { kind: 'gap', city: 'Jackson',      state: 'MS', lat: 32.2988, lng: -90.1848,  insecurity: 23.1 },
  { kind: 'gap', city: 'Birmingham',   state: 'AL', lat: 33.5186, lng: -86.8104,  insecurity: 21.6 },
  { kind: 'gap', city: 'New Orleans',  state: 'LA', lat: 29.9511, lng: -90.0715,  insecurity: 22.3 },
  { kind: 'gap', city: 'Fresno',       state: 'CA', lat: 36.7378, lng: -119.7871, insecurity: 17.3 },
  { kind: 'gap', city: 'Albuquerque',  state: 'NM', lat: 35.0844, lng: -106.6504, insecurity: 16.9 },
  { kind: 'gap', city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652,  insecurity: 18.4 },
  { kind: 'gap', city: 'Tucson',       state: 'AZ', lat: 32.2226, lng: -110.9747, insecurity: 15.8 },
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
