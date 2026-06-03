// Real tile-based map of the fridge network using Leaflet +
// OpenStreetMap tiles. Smooth pan + zoom that mirrors the
// Google/Apple Maps interaction model. Web only — native gets
// the list view from FridgeListView.js.
//
// Behaviour:
//   - Mounts once on first render; reuses the same map instance
//     when fridges/userLocation change to avoid the flicker that
//     comes from re-creating tile layers.
//   - Tries the browser geolocation API on mount. If the user
//     grants permission we drop a 'You are here' marker and zoom
//     to neighborhood level (z=12); otherwise we frame the whole
//     fridge network and fall back to continental-US center.
//   - Each fridge marker has a popup with name, address, hours,
//     capacity, and a directions link that opens the user's
//     preferred maps app.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import { ensureLeaflet } from './leafletLoader';

function directionsUrl(f) {
  if (f.lat != null && f.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;
  }
  const q = encodeURIComponent([f.name, f.address, f.city, f.state].filter(Boolean).join(', '));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// HTML for the popup. Inline so it survives Leaflet's
// String → DOM conversion without React.
function popupHtml(f) {
  const lines = [
    `<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#FF4D8D">Community Fridge</div>`,
    `<div style="font-size:16px;font-weight:800;color:#1B3A2D;margin-top:2px">${escape(f.name || '(unnamed)')}</div>`,
  ];
  if (f.address || f.city) {
    lines.push(`<div style="font-size:12px;color:#7A766C;margin-top:4px">${escape([f.address, f.city, f.state].filter(Boolean).join(', '))}</div>`);
  }
  if (f.hours)    lines.push(`<div style="font-size:12px;color:#1B3A2D;margin-top:6px">Hours: ${escape(f.hours)}</div>`);
  if (f.capacity) lines.push(`<div style="font-size:12px;color:#1B3A2D;margin-top:2px">Capacity: ${escape(f.capacity)}</div>`);
  lines.push(`<a href="${directionsUrl(f)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;background:#1B3A2D;color:#FFF;font-weight:700;font-size:12px;text-decoration:none;padding:8px 12px;border-radius:999px">Get directions →</a>`);
  return lines.join('');
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default function FridgeLeafletMap({ fridges = [], userLocation, height = 580 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const youAreHereRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1) Mount Leaflet once.
  useEffect(() => {
    let cancelled = false;
    ensureLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, {
          center: userLocation || [39.5, -98.35], // continental US center
          zoom: userLocation ? 12 : 4,
          scrollWheelZoom: true,
          zoomControl: true,
          worldCopyJump: false,
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        markerLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
        youAreHereRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Render / refresh fridge markers whenever the data changes.
  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();

    const valid = fridges.filter((f) => f.lat != null && f.lng != null);
    valid.forEach((f) => {
      const color = f.capacity === 'low' ? '#EF4444' : (f.capacity === 'high' ? '#1B3A2D' : '#FF4D8D');
      const icon = L.divIcon({
        className: 'bn-fridge-marker',
        html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid #FFF;box-shadow:0 2px 6px rgba(0,0,0,0.25)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([f.lat, f.lng], { icon })
        .bindPopup(popupHtml(f), { maxWidth: 260 })
        .addTo(layer);
    });

    // If we don't yet know the user's location and we have markers,
    // frame the whole network so the map opens looking useful.
    if (!userLocation && valid.length > 0) {
      const bounds = L.latLngBounds(valid.map((f) => [f.lat, f.lng]));
      map.fitBounds(bounds.pad(0.2), { animate: false });
    }
  }, [fridges, userLocation]);

  // 3) When userLocation arrives, drop a 'You are here' marker and
  //    re-center smoothly.
  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const map = mapRef.current;
    if (!L || !map || !userLocation) return;
    if (youAreHereRef.current) youAreHereRef.current.remove();
    const icon = L.divIcon({
      className: 'bn-you-here',
      html: `<div style="position:relative;width:24px;height:24px;">
               <div style="position:absolute;inset:0;border-radius:50%;background:#3B82F6;opacity:0.25"></div>
               <div style="position:absolute;inset:6px;border-radius:50%;background:#3B82F6;border:2px solid #FFF;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>
             </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    youAreHereRef.current = L.marker([userLocation[0], userLocation[1]], { icon, interactive: false }).addTo(map);
    map.flyTo(userLocation, Math.max(map.getZoom(), 12), { duration: 0.8 });
  }, [userLocation]);

  if (error) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackTitle}>Map couldn't load</Text>
        <Text style={styles.fallbackBody}>{error}. Switch to List view to see fridges.</Text>
      </View>
    );
  }

  return (
    <View style={{ position: 'relative' }}>
      {React.createElement('div', {
        ref: containerRef,
        style: {
          width: '100%',
          height,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#E9E4D4',
        },
      })}
      {loading ? (
        <View style={[styles.loader, { height }]}>
          <ActivityIndicator color={Colors.green} />
          <Text style={styles.loaderText}>Loading map…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#FEF2F2', borderRadius: Radius.lg, padding: 24, alignItems: 'center', justifyContent: 'center' },
  fallbackTitle: { fontSize: 16, fontWeight: '800', color: Colors.pink, marginBottom: 4 },
  fallbackBody: { ...Type.body, color: Colors.gray, textAlign: 'center' },
  loader: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5EFCC', borderRadius: Radius.lg },
  loaderText: { ...Type.caption, marginTop: 8 },
});
