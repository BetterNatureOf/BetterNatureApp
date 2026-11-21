const { cellToLatLng } = require('h3-js');

const MAX_ORIGINS = 19;
const ROUTING_TIMEOUT_MS = 2000;

// OSRM-compatible table service. Origins are fixed grid centers, never
// volunteer coordinates or identifiers. A missing estimate stays missing.
async function pickupRoadTimes(cells, destination) {
  const endpoint = process.env.RESCUE_ROUTING_BASE_URL;
  if (!endpoint || !cells.length || cells.length > MAX_ORIGINS) return new Map();

  try {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return new Map();
    const locations = [...cells.map(cellToLatLng), destination]
      .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
    base.pathname = `${base.pathname.replace(/\/$/, '')}/table/v1/driving/${locations.join(';')}`;
    base.searchParams.set('sources', cells.map((_, index) => index).join(';'));
    base.searchParams.set('destinations', String(cells.length));
    base.searchParams.set('annotations', 'duration');

    const token = process.env.RESCUE_ROUTING_TOKEN;
    const response = await fetch(base, {
      signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
      redirect: 'error',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) return new Map();
    const { code, durations } = await response.json();
    if (code !== 'Ok' || !Array.isArray(durations) || durations.length !== cells.length) return new Map();
    const times = new Map();
    durations.forEach((row, index) => {
      if (Array.isArray(row) && row.length === 1 && Number.isFinite(row[0]) && row[0] >= 0) {
        times.set(cells[index], row[0]);
      }
    });
    return times;
  } catch {
    return new Map();
  }
}

module.exports = { pickupRoadTimes };
