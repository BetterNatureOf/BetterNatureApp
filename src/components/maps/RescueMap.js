// Rescue map (web). One interface, two renderers:
//   • Mapbox GL JS with the quieted Mapbox Standard style (intended), when a
//     public token is configured and WebGL works;
//   • a Leaflet + OpenStreetMap raster fallback with the same overlays,
//     when Mapbox can't load. The fallback is labeled as such.
//
// Modes
//   browse  pickups as quiet clustered counts; tap to select (no labels on
//           every pickup, no volunteer dots, no recipient locations)
//   trip    the stops of one rescue and, only when the server returned
//           real road geometry, the route line. Never a straight connector.
//
// Camera: frames the data once; after someone pans or zooms it never moves
// on its own. "Fit" re-frames on request. Reduced motion disables easing.
import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Colors } from '../../config/theme';
import {
  hasMapboxToken, MAPBOX_PUBLIC_TOKEN, MAPBOX_STYLE, MAPBOX_BASEMAP_CONFIG, MAP_COLORS, SHEET_PADDING,
  FALLBACK_TILES, FALLBACK_ATTRIBUTION, FALLBACK_TILE_FILTER,
} from '../../config/mapTheme';
import { ensureMapboxGl, webglAvailable } from './mapboxLoader';
import { ensureLeaflet } from './leafletLoader';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const validPoint = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

function boundsOf(points, route) {
  const coords = [...points.filter(validPoint).map((p) => [p.lng, p.lat]), ...(route?.geometry || [])];
  if (!coords.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of coords) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
  return [[w, s], [e, n]];
}

function stopElement({ kind, label }, selected = false) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', label || (kind === 'destination' ? 'Receiving site' : kind === 'origin' ? 'Your approximate area' : 'Pickup'));
  const color = kind === 'destination' ? MAP_COLORS.destination : kind === 'origin' ? 'transparent' : MAP_COLORS.pickup;
  Object.assign(el.style, {
    width: kind === 'origin' ? '22px' : '30px', height: kind === 'origin' ? '22px' : '30px', borderRadius: kind === 'destination' ? '8px' : '50%',
    border: kind === 'origin' ? `2px dashed ${MAP_COLORS.pickup}` : `3px solid ${MAP_COLORS.selectedRing}`,
    background: color, boxShadow: '0 2px 8px rgba(32,57,46,.28)', cursor: 'default', padding: 0,
    outline: selected ? `3px solid ${Colors.green}` : 'none', color: '#fff', font: '700 13px system-ui',
  });
  el.textContent = kind === 'destination' ? '↓' : kind === 'pickup' ? '↑' : '';
  return el;
}

// ── Mapbox GL renderer ──────────────────────────────────────────────────
function useMapbox({ container, enabled, mode, points, selectedId, onSelect, stops, route, onFail, framedRef, movedRef }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true, map;
    ensureMapboxGl().then((mapboxgl) => {
      if (!alive || !container.current) return;
      mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN;
      map = new mapboxgl.Map({ container: container.current, style: MAPBOX_STYLE, config: { basemap: MAPBOX_BASEMAP_CONFIG },
        center: [-90.05, 35.15], zoom: 11, attributionControl: true, cooperativeGestures: false, pitchWithRotate: false, dragRotate: false });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('error', (e) => { if (e?.error?.status === 401 || e?.error?.status === 403) onFail('auth'); });
      const moved = (e) => { if (e.originalEvent) movedRef.current = true; };
      map.on('dragstart', moved); map.on('zoomstart', moved);
      map.on('style.load', () => {
        map.addSource('pickups', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 14 });
        map.addLayer({ id: 'clusters', type: 'circle', source: 'pickups', slot: 'top', filter: ['has', 'point_count'],
          paint: { 'circle-color': MAP_COLORS.cluster, 'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 15, 24],
            'circle-stroke-width': 3, 'circle-stroke-color': '#fff', 'circle-emissive-strength': 1 } });
        map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'pickups', slot: 'top', filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-allow-overlap': true },
          paint: { 'text-color': MAP_COLORS.clusterText, 'text-emissive-strength': 1 } });
        map.addLayer({ id: 'pickup-points', type: 'circle', source: 'pickups', slot: 'top', filter: ['!', ['has', 'point_count']],
          paint: { 'circle-color': ['case', ['get', 'soon'], MAP_COLORS.pickupSoon, MAP_COLORS.pickup],
            'circle-radius': ['case', ['get', 'selected'], 11, 8], 'circle-stroke-width': ['case', ['get', 'selected'], 4, 2.5],
            'circle-stroke-color': '#fff', 'circle-emissive-strength': 1 } });
        map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', slot: 'top', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': MAP_COLORS.routeCasing, 'line-width': 9, 'line-emissive-strength': 1 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', slot: 'top', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': MAP_COLORS.route, 'line-width': 5, 'line-emissive-strength': 1 } });
        map.on('click', 'clusters', (e) => {
          const f = e.features?.[0]; if (!f) return;
          map.getSource('pickups').getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
            if (!err) map.easeTo({ center: f.geometry.coordinates, zoom, duration: reducedMotion() ? 0 : 400 });
          });
        });
        map.on('click', 'pickup-points', (e) => { const id = e.features?.[0]?.properties?.id; if (id) onSelect?.(id); });
        for (const layer of ['clusters', 'pickup-points']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
        }
        ref.current = { map, mapboxgl, markers: [] };
        setReady(true);
      });
    }).catch(() => onFail('load'));
    return () => { alive = false; ref.current?.markers.forEach((m) => m.remove()); map?.remove(); ref.current = null; setReady(false); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !ref.current) return;
    const { map, mapboxgl } = ref.current;
    map.getSource('pickups').setData({ type: 'FeatureCollection', features: mode === 'browse' ? points.filter(validPoint).map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, soon: !!p.soon, selected: p.id === selectedId },
    })) : [] });
    map.getSource('route').setData({ type: 'FeatureCollection', features: mode === 'trip' && route?.geometry?.length > 1
      ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: route.geometry }, properties: {} }] : [] });
    ref.current.markers.forEach((m) => m.remove());
    ref.current.markers = mode === 'trip' ? stops.filter(validPoint).map((s) => new mapboxgl.Marker({ element: stopElement(s) }).setLngLat([s.lng, s.lat]).addTo(map)) : [];
    const b = boundsOf(mode === 'trip' ? stops : points, mode === 'trip' ? route : null);
    if (b && (!framedRef.current || (mode === 'trip' && route?.geometry && framedRef.current === 'stops' && !movedRef.current))) {
      framedRef.current = mode === 'trip' && !route?.geometry ? 'stops' : 'done';
      map.fitBounds(b, { padding: SHEET_PADDING, maxZoom: 15, duration: 0 });
    }
  }, [ready, mode, points, selectedId, stops, route]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, fit: () => {
    const b = boundsOf(mode === 'trip' ? stops : points, mode === 'trip' ? route : null);
    if (b && ref.current) ref.current.map.fitBounds(b, { padding: SHEET_PADDING, maxZoom: 15, duration: reducedMotion() ? 0 : 500 });
    movedRef.current = false;
  }, center: () => ref.current?.map.getCenter() };
}

// ── Leaflet raster fallback ─────────────────────────────────────────────
function useLeaflet({ container, enabled, mode, points, selectedId, onSelect, stops, route, onFail, framedRef, movedRef }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(11);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true, map;
    ensureLeaflet().then((L) => {
      if (!alive || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView([35.15, -90.05], 11);
      const pane = map.createPane('basemap');
      pane.style.zIndex = '200'; pane.style.filter = FALLBACK_TILE_FILTER;
      L.tileLayer(FALLBACK_TILES, { maxZoom: 19, pane: 'basemap', attribution: FALLBACK_ATTRIBUTION }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      map.on('zoomend', () => alive && setZoom(map.getZoom()));
      map.on('dragstart', () => { movedRef.current = true; });
      map.on('zoomstart', (e) => { if (e?.originalEvent || map._bnUserZoom) movedRef.current = true; });
      ref.current = { L, map, layer: L.layerGroup().addTo(map) };
      setReady(true);
    }).catch(() => onFail('load'));
    return () => { alive = false; map?.remove(); ref.current = null; setReady(false); };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !ref.current) return;
    const { L, map, layer } = ref.current;
    layer.clearLayers();
    if (mode === 'browse') {
      // Grid clustering in screen space: nearby pickups become one count.
      const groups = new Map();
      for (const p of points.filter(validPoint)) {
        const pt = map.project([p.lat, p.lng], zoom);
        const key = `${Math.floor(pt.x / 56)}:${Math.floor(pt.y / 56)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }
      for (const group of groups.values()) {
        const lat = group.reduce((a, p) => a + p.lat, 0) / group.length, lng = group.reduce((a, p) => a + p.lng, 0) / group.length;
        const single = group.length === 1 ? group[0] : null;
        const selected = single && single.id === selectedId;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = single ? '' : String(group.length);
        btn.setAttribute('aria-label', single ? `${single.label || 'Pickup'}${single.soon ? ', closing soon' : ''}` : `${group.length} pickups here — zoom in`);
        if (single) btn.setAttribute('aria-pressed', String(!!selected));
        const size = single ? (selected ? 24 : 18) : group.length >= 15 ? 46 : group.length >= 5 ? 40 : 34;
        Object.assign(btn.style, { width: `${size}px`, height: `${size}px`, borderRadius: '50%', border: `${selected ? 4 : 3}px solid #fff`,
          background: single?.soon ? MAP_COLORS.pickupSoon : MAP_COLORS.pickup, color: '#fff', font: '700 14px system-ui',
          boxShadow: '0 2px 8px rgba(32,57,46,.3)', cursor: 'pointer', padding: 0 });
        L.DomEvent.disableClickPropagation(btn);
        btn.addEventListener('click', () => {
          if (single) onSelect?.(single.id);
          else map.fitBounds(group.map((p) => [p.lat, p.lng]), { padding: [60, 60], maxZoom: Math.min(18, zoom + 3), animate: !reducedMotion() });
        });
        L.marker([lat, lng], { keyboard: false, icon: L.divIcon({ html: btn, className: '', iconSize: [size, size] }) }).addTo(layer);
      }
    } else {
      if (route?.geometry?.length > 1) {
        const latlngs = route.geometry.map(([lng, lat]) => [lat, lng]);
        L.polyline(latlngs, { color: MAP_COLORS.routeCasing, weight: 9, opacity: 1 }).addTo(layer);
        L.polyline(latlngs, { color: MAP_COLORS.route, weight: 5, opacity: 1 }).addTo(layer);
      }
      for (const s of stops.filter(validPoint)) {
        L.marker([s.lat, s.lng], { keyboard: false, icon: L.divIcon({ html: stopElement(s), className: '', iconSize: [30, 30] }) }).addTo(layer);
      }
    }
    const b = boundsOf(mode === 'trip' ? stops : points, mode === 'trip' ? route : null);
    if (b && (!framedRef.current || (mode === 'trip' && route?.geometry && framedRef.current === 'stops' && !movedRef.current))) {
      framedRef.current = mode === 'trip' && !route?.geometry ? 'stops' : 'done';
      map.fitBounds([[b[0][1], b[0][0]], [b[1][1], b[1][0]]], { animate: false, maxZoom: 15,
        paddingTopLeft: [SHEET_PADDING.left, SHEET_PADDING.top], paddingBottomRight: [SHEET_PADDING.right, mode === 'trip' ? 40 : SHEET_PADDING.bottom] });
    }
  }, [ready, mode, points, selectedId, stops, route, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, fit: () => {
    const b = boundsOf(mode === 'trip' ? stops : points, mode === 'trip' ? route : null);
    if (b && ref.current) ref.current.map.fitBounds([[b[0][1], b[0][0]], [b[1][1], b[1][0]]], { animate: !reducedMotion(), maxZoom: 15,
      paddingTopLeft: [SHEET_PADDING.left, SHEET_PADDING.top], paddingBottomRight: [SHEET_PADDING.right, mode === 'trip' ? 40 : SHEET_PADDING.bottom] });
    movedRef.current = false;
  }, center: () => { const c = ref.current?.map.getCenter(); return c ? { lat: c.lat, lng: c.lng } : null; } };
}

export default function RescueMap({ mode = 'browse', points = [], selectedId = null, onSelect, stops = [], route = null,
  height = 'clamp(320px, calc(100dvh - 300px), 640px)', onPickArea, ariaLabel, children }) {
  const container = useRef(null);
  const framedRef = useRef(false);
  const movedRef = useRef(false);
  const [renderer, setRenderer] = useState(() => (hasMapboxToken() && typeof window !== 'undefined' && webglAvailable() ? 'mapbox' : 'fallback'));
  const [failed, setFailed] = useState(false);
  const common = { container, mode, points, selectedId, onSelect, stops, route, framedRef, movedRef };
  const mb = useMapbox({ ...common, enabled: renderer === 'mapbox', onFail: () => { framedRef.current = false; setRenderer('fallback'); } });
  const lf = useLeaflet({ ...common, enabled: renderer === 'fallback', onFail: () => setFailed(true) });
  const active = renderer === 'mapbox' ? mb : lf;

  if (failed) {
    return (
      <div role="status" style={{ padding: 16, borderRadius: 20, background: Colors.greenLight }}>
        <Text style={{ color: Colors.dark }}>The map couldn’t load. Everything you need is listed below.</Text>
      </div>
    );
  }
  const btn = { minHeight: 44, minWidth: 44, padding: '0 12px', border: 0, borderRadius: 14, background: Colors.cream, color: Colors.green,
    font: '600 14px system-ui', cursor: 'pointer', boxShadow: '0 2px 10px rgba(32,57,46,.18)' };
  return (
    <div role="region" aria-label={ariaLabel || (mode === 'trip' ? 'Rescue route map' : 'Map of open pickups')}
      style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', isolation: 'isolate', background: '#F1ECE3' }}>
      <div ref={container} style={{ height, zIndex: 0 }} />
      {!active.ready && (
        <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#F1ECE3', zIndex: 600 }}>
          <Text style={{ color: Colors.green }}>Loading map…</Text>
        </div>
      )}
      {active.ready && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 500, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={active.fit} style={btn} aria-label={mode === 'trip' ? (route?.geometry ? 'Fit the whole route' : 'Fit both stops') : 'Show all pickups'}>
            {mode === 'trip' ? (route?.geometry ? 'Fit route' : 'Fit stops') : 'Show all'}
          </button>
          {onPickArea && (
            <button type="button" style={btn} onClick={() => { const c = active.center(); if (c) onPickArea(c.lat, c.lng); }}>
              Use map center as my area
            </button>
          )}
        </div>
      )}
      {renderer === 'fallback' && active.ready && (
        <div style={{ position: 'absolute', bottom: 22, left: 10, zIndex: 500, background: 'rgba(250,248,245,.92)', borderRadius: 8, padding: '2px 8px' }}>
          <Text style={{ fontSize: 11, color: Colors.gray }}>{hasMapboxToken() ? 'Simplified map (Mapbox unavailable)' : 'Simplified map'}</Text>
        </div>
      )}
      {children}
    </div>
  );
}
