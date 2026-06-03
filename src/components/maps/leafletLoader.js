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
