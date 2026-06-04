// Lazy-loads Leaflet from a CDN on first call. We don't add Leaflet
// as an npm dependency because (a) it bloats the bundle by ~150KB
// even when nobody opens the map, and (b) Leaflet wants real DOM,
// so it's only useful on web — native ships Leaflet-free.
//
// Returns the global `L` once ready. Subsequent calls resolve
// immediately. Safe to call from useEffect; we de-dupe across
// concurrent callers.

const CDN_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CDN_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const D3_GEO         = 'https://cdn.jsdelivr.net/npm/d3-geo@3/dist/d3-geo.min.js';
// d3-geo-projection's UMD reads d3-array off the global d3 namespace.
// If d3-array isn't there first, geoRobinson() throws
// "r.geoProjection is not a function" mid-factory. Load array before
// projection so the projection factory finds everything it expects.
const D3_ARRAY       = 'https://cdn.jsdelivr.net/npm/d3-array@3/dist/d3-array.min.js';
const D3_PROJECTION  = 'https://cdn.jsdelivr.net/npm/d3-geo-projection@4/dist/d3-geo-projection.min.js';
const TOPOJSON       = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
const WORLD_ATLAS    = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const US_STATES      = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

function loadScriptOnce(url) {
  if (typeof window === 'undefined') return Promise.reject(new Error('window missing'));
  if (window[`__loaded:${url}`]) return Promise.resolve();
  if (window[`__loading:${url}`]) return window[`__loading:${url}`];
  window[`__loading:${url}`] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => { window[`__loaded:${url}`] = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load ' + url));
    document.head.appendChild(s);
  });
  return window[`__loading:${url}`];
}

// Lazy-loads d3-geo + d3-geo-projection + topojson-client + the
// world-atlas 1:110m TopoJSON. Returns { d3, topojson, world } once
// everything is ready. We cache the parsed atlas on window so
// subsequent map opens are instant.
export function ensureWorldGeo() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Robinson map only renders in a browser'));
  if (window.__bnWorldGeo) return Promise.resolve(window.__bnWorldGeo);
  if (window.__bnWorldGeoLoading) return window.__bnWorldGeoLoading;
  window.__bnWorldGeoLoading = (async () => {
    // Strict order: d3-geo + d3-array first, then geo-projection (which
    // depends on both), then topojson-client.
    await loadScriptOnce(D3_GEO);
    await loadScriptOnce(D3_ARRAY);
    await loadScriptOnce(D3_PROJECTION);
    await loadScriptOnce(TOPOJSON);
    // Parallel fetch — world borders + US states. The states layer
    // gives the Robinson choropleth real US sub-national outlines so
    // hovering inside the US surfaces state-level rates instead of
    // a single country-wide blob.
    const [world, usStates] = await Promise.all([
      fetch(WORLD_ATLAS).then((r) => {
        if (!r.ok) throw new Error('world-atlas fetch failed');
        return r.json();
      }),
      fetch(US_STATES).then((r) => {
        if (!r.ok) throw new Error('us-atlas fetch failed');
        return r.json();
      }).catch(() => null), // optional — map still works without it
    ]);
    const result = { d3: window.d3, topojson: window.topojson, world, usStates };
    window.__bnWorldGeo = result;
    return result;
  })();
  return window.__bnWorldGeoLoading;
}

export function ensureLeaflet() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Leaflet only loads in a browser context'));
  }
  if (window.L) return Promise.resolve(window.L);
  if (window.__leafletLoading) return window.__leafletLoading;

  window.__leafletLoading = new Promise((resolve, reject) => {
    // CSS first so the map tiles size correctly the moment they paint.
    if (!document.querySelector('link[data-bn-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CDN_CSS;
      link.setAttribute('data-bn-leaflet', '1');
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = CDN_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet from CDN'));
    document.head.appendChild(script);
  });
  return window.__leafletLoading;
}
