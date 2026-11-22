// Loads Mapbox GL JS (web only) from Mapbox's CDN on first use, so the
// bundle doesn't carry it for people who never open a map.
import { MAPBOX_GL_VERSION } from '../../config/mapTheme';

const CSS = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.css`;
const JS = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSION}/mapbox-gl.js`;

export function ensureMapboxGl() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('Mapbox GL needs a browser'));
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (window.__bnMapboxLoading) return window.__bnMapboxLoading;
  window.__bnMapboxLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-bn-mapbox]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = CSS; link.setAttribute('data-bn-mapbox', '1');
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = JS; script.async = true;
    script.onload = () => (window.mapboxgl ? resolve(window.mapboxgl) : reject(new Error('Mapbox GL missing')));
    script.onerror = () => { window.__bnMapboxLoading = null; reject(new Error('Failed to load Mapbox GL')); };
    document.head.appendChild(script);
  });
  return window.__bnMapboxLoading;
}

// WebGL is required by Mapbox GL; without it we use the raster fallback.
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
