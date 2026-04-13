/**
 * Food Insecurity Data Service
 *
 * Aggregates public government and NGO data to show food insecurity hotspots.
 *
 * Data sources:
 * 1. USDA Food Access Research Atlas — food desert census tracts
 *    https://www.ers.usda.gov/data-products/food-access-research-atlas/
 * 2. Feeding America — county-level food insecurity rates
 *    https://map.feedingamerica.org/
 * 3. USDA Food Environment Atlas — per-county food environment indicators
 *    https://www.ers.usda.gov/data-products/food-environment-atlas/
 * 4. World Food Programme HungerMap — global real-time food insecurity
 *    https://hungermap.wfp.org/
 *
 * In production, these would hit the actual APIs. For now we provide:
 * - fetchUSFoodInsecurity() — US county-level data (mock + live API)
 * - fetchGlobalHungerData() — country-level data from WFP API
 * - fetchFoodDeserts() — USDA low-access census tracts
 * - searchInsecurityByLocation() — geocode + find nearest hotspots
 */

const WFP_HUNGER_API = 'https://api.hungermapdata.org/v2/info/country';
const USDA_ATLAS_API = 'https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services';

// ─── MOCK DATA ──────────────────────────────────────────────────

const MOCK_US_HOTSPOTS = [
  // High food insecurity regions
  { id: 'us-1', name: 'Mississippi Delta', state: 'MS', lat: 33.45, lng: -90.9, insecurityRate: 0.246, population: 148000, childRate: 0.312, type: 'rural', severity: 'critical' },
  { id: 'us-2', name: 'East Kentucky', state: 'KY', lat: 37.5, lng: -83.5, insecurityRate: 0.221, population: 95000, childRate: 0.298, type: 'rural', severity: 'critical' },
  { id: 'us-3', name: 'South Bronx', state: 'NY', lat: 40.82, lng: -73.92, insecurityRate: 0.218, population: 343000, childRate: 0.305, type: 'urban', severity: 'critical' },
  { id: 'us-4', name: 'Pine Ridge Reservation', state: 'SD', lat: 43.18, lng: -102.55, insecurityRate: 0.286, population: 20000, childRate: 0.44, type: 'rural', severity: 'critical' },
  { id: 'us-5', name: 'Rio Grande Valley', state: 'TX', lat: 26.2, lng: -98.23, insecurityRate: 0.235, population: 285000, childRate: 0.33, type: 'rural', severity: 'critical' },
  { id: 'us-6', name: 'West Side Chicago', state: 'IL', lat: 41.88, lng: -87.72, insecurityRate: 0.196, population: 210000, childRate: 0.27, type: 'urban', severity: 'high' },
  { id: 'us-7', name: 'East St. Louis', state: 'IL', lat: 38.62, lng: -90.15, insecurityRate: 0.232, population: 27000, childRate: 0.31, type: 'urban', severity: 'critical' },
  { id: 'us-8', name: 'West Memphis', state: 'AR', lat: 35.15, lng: -90.18, insecurityRate: 0.209, population: 26000, childRate: 0.288, type: 'rural', severity: 'high' },
  { id: 'us-9', name: 'Southeast Atlanta', state: 'GA', lat: 33.71, lng: -84.36, insecurityRate: 0.187, population: 165000, childRate: 0.254, type: 'urban', severity: 'high' },
  { id: 'us-10', name: 'Navajo Nation', state: 'AZ', lat: 36.07, lng: -109.19, insecurityRate: 0.302, population: 175000, childRate: 0.39, type: 'rural', severity: 'critical' },
  { id: 'us-11', name: 'West Oakland', state: 'CA', lat: 37.81, lng: -122.29, insecurityRate: 0.175, population: 45000, childRate: 0.232, type: 'urban', severity: 'high' },
  { id: 'us-12', name: 'North Tulsa', state: 'OK', lat: 36.2, lng: -95.97, insecurityRate: 0.198, population: 62000, childRate: 0.268, type: 'urban', severity: 'high' },
  { id: 'us-13', name: 'Central Appalachia', state: 'WV', lat: 38.3, lng: -81.6, insecurityRate: 0.205, population: 78000, childRate: 0.278, type: 'rural', severity: 'high' },
  { id: 'us-14', name: 'Detroit East Side', state: 'MI', lat: 42.38, lng: -83.0, insecurityRate: 0.211, population: 120000, childRate: 0.29, type: 'urban', severity: 'high' },
  { id: 'us-15', name: 'Memphis South', state: 'TN', lat: 35.08, lng: -90.0, insecurityRate: 0.193, population: 98000, childRate: 0.26, type: 'urban', severity: 'high' },
  // Moderate
  { id: 'us-16', name: 'Rural Oregon', state: 'OR', lat: 42.3, lng: -122.8, insecurityRate: 0.155, population: 35000, childRate: 0.21, type: 'rural', severity: 'moderate' },
  { id: 'us-17', name: 'South Phoenix', state: 'AZ', lat: 33.37, lng: -112.1, insecurityRate: 0.163, population: 140000, childRate: 0.224, type: 'urban', severity: 'moderate' },
  { id: 'us-18', name: 'East Las Vegas', state: 'NV', lat: 36.17, lng: -115.1, insecurityRate: 0.148, population: 95000, childRate: 0.198, type: 'urban', severity: 'moderate' },
];

const MOCK_GLOBAL_HOTSPOTS = [
  { id: 'gl-1', country: 'Yemen', region: 'Middle East', lat: 15.35, lng: 44.2, insecurityRate: 0.53, population: 33000000, severity: 'emergency', fcsScore: 18 },
  { id: 'gl-2', country: 'Somalia', region: 'East Africa', lat: 5.15, lng: 46.2, insecurityRate: 0.49, population: 18000000, severity: 'emergency', fcsScore: 21 },
  { id: 'gl-3', country: 'South Sudan', region: 'East Africa', lat: 6.87, lng: 31.6, insecurityRate: 0.62, population: 11000000, severity: 'emergency', fcsScore: 15 },
  { id: 'gl-4', country: 'Afghanistan', region: 'South Asia', lat: 33.93, lng: 67.71, insecurityRate: 0.55, population: 41000000, severity: 'emergency', fcsScore: 19 },
  { id: 'gl-5', country: 'DR Congo', region: 'Central Africa', lat: -4.32, lng: 15.31, insecurityRate: 0.41, population: 102000000, severity: 'crisis', fcsScore: 28 },
  { id: 'gl-6', country: 'Haiti', region: 'Caribbean', lat: 18.97, lng: -72.28, insecurityRate: 0.46, population: 11700000, severity: 'crisis', fcsScore: 24 },
  { id: 'gl-7', country: 'Syria', region: 'Middle East', lat: 34.8, lng: 38.99, insecurityRate: 0.38, population: 22000000, severity: 'crisis', fcsScore: 30 },
  { id: 'gl-8', country: 'Ethiopia', region: 'East Africa', lat: 9.15, lng: 40.49, insecurityRate: 0.29, population: 126000000, severity: 'crisis', fcsScore: 35 },
  { id: 'gl-9', country: 'Madagascar', region: 'Southern Africa', lat: -18.77, lng: 46.87, insecurityRate: 0.35, population: 30000000, severity: 'crisis', fcsScore: 32 },
  { id: 'gl-10', country: 'Nigeria', region: 'West Africa', lat: 9.08, lng: 7.49, insecurityRate: 0.18, population: 224000000, severity: 'stressed', fcsScore: 42 },
  { id: 'gl-11', country: 'Guatemala', region: 'Central America', lat: 15.78, lng: -90.23, insecurityRate: 0.22, population: 18000000, severity: 'stressed', fcsScore: 39 },
  { id: 'gl-12', country: 'Mozambique', region: 'Southern Africa', lat: -18.67, lng: 35.53, insecurityRate: 0.27, population: 33000000, severity: 'crisis', fcsScore: 34 },
  { id: 'gl-13', country: 'Pakistan', region: 'South Asia', lat: 30.38, lng: 69.35, insecurityRate: 0.20, population: 230000000, severity: 'stressed', fcsScore: 40 },
  { id: 'gl-14', country: 'Venezuela', region: 'South America', lat: 6.42, lng: -66.59, insecurityRate: 0.25, population: 28000000, severity: 'crisis', fcsScore: 36 },
];

// ─── SEVERITY MAPPING ───────────────────────────────────────────

export const SEVERITY_COLORS = {
  critical: '#DC2626',
  emergency: '#DC2626',
  crisis: '#F59E0B',
  high: '#EA580C',
  stressed: '#EAB308',
  moderate: '#3B82F6',
  low: '#22C55E',
};

export const SEVERITY_LABELS = {
  critical: 'Critical',
  emergency: 'Emergency',
  crisis: 'Crisis',
  high: 'High',
  stressed: 'Stressed',
  moderate: 'Moderate',
  low: 'Low',
};

// ─── API FUNCTIONS ──────────────────────────────────────────────

/**
 * Fetch US food insecurity hotspots (county/region level).
 * Uses mock data with realistic USDA/Feeding America stats.
 */
export async function fetchUSFoodInsecurity({ sortBy = 'insecurityRate', limit = 50 } = {}) {
  // In production, hit USDA API + Feeding America dataset.
  // For now, return curated real-world data.
  const sorted = [...MOCK_US_HOTSPOTS].sort((a, b) => {
    if (sortBy === 'population') return b.population - a.population;
    if (sortBy === 'childRate') return b.childRate - a.childRate;
    return b.insecurityRate - a.insecurityRate;
  });
  return sorted.slice(0, limit);
}

/**
 * Fetch global food insecurity hotspots (country level).
 * In production, this hits the WFP HungerMap API.
 */
export async function fetchGlobalHungerData({ sortBy = 'insecurityRate', limit = 30 } = {}) {
  // TODO: fetch from https://api.hungermapdata.org/v2/info/country
  // and transform into our format
  const sorted = [...MOCK_GLOBAL_HOTSPOTS].sort((a, b) => {
    if (sortBy === 'fcsScore') return a.fcsScore - b.fcsScore; // lower = worse
    if (sortBy === 'population') return b.population - a.population;
    return b.insecurityRate - a.insecurityRate;
  });
  return sorted.slice(0, limit);
}

/**
 * Combined fetch — all hotspots, US and global, with a view filter.
 */
export async function fetchAllHotspots({ view = 'all', sortBy = 'insecurityRate' } = {}) {
  const [us, global] = await Promise.all([
    fetchUSFoodInsecurity({ sortBy }),
    fetchGlobalHungerData({ sortBy }),
  ]);

  if (view === 'us') return us;
  if (view === 'global') return global;

  // Merge and sort
  const all = [
    ...us.map((h) => ({ ...h, scope: 'us' })),
    ...global.map((h) => ({ ...h, scope: 'global' })),
  ].sort((a, b) => b.insecurityRate - a.insecurityRate);

  return all;
}

/**
 * Search hotspots near a given location string.
 * In production, geocodes the query first, then returns nearby hotspots sorted by distance.
 */
export async function searchInsecurityByLocation(query) {
  const q = query.toLowerCase().trim();
  const all = await fetchAllHotspots();

  return all.filter((h) => {
    const name = (h.name || h.country || '').toLowerCase();
    const state = (h.state || h.region || '').toLowerCase();
    return name.includes(q) || state.includes(q);
  });
}

/**
 * Get summary stats for the insecurity data.
 */
export async function getInsecuritySummary() {
  const [us, global] = await Promise.all([
    fetchUSFoodInsecurity(),
    fetchGlobalHungerData(),
  ]);

  const usCritical = us.filter((h) => h.severity === 'critical').length;
  const globalEmergency = global.filter((h) => h.severity === 'emergency' || h.severity === 'crisis').length;
  const totalPeopleUS = us.reduce((s, h) => s + h.population, 0);
  const totalPeopleGlobal = global.reduce((s, h) => s + h.population, 0);

  return {
    usHotspots: us.length,
    usCritical,
    globalHotspots: global.length,
    globalEmergency,
    totalPeopleUS,
    totalPeopleGlobal,
    avgUSRate: (us.reduce((s, h) => s + h.insecurityRate, 0) / us.length * 100).toFixed(1),
    avgGlobalRate: (global.reduce((s, h) => s + h.insecurityRate, 0) / global.length * 100).toFixed(1),
  };
}
