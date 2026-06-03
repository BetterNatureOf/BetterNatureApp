// Robinson-projected world food-insecurity map. Lazy-loads d3-geo
// + d3-geo-projection + topojson-client + the world-atlas 1:110m
// TopoJSON the first time it renders, then draws every country as
// an SVG path colored by its FAO 2022 insecurity rate.
//
// Hover any country (web) for a stat card with the rate plus live
// BetterNature presence in that country (chapters / fridges / gap
// cities). Native renders a sorted list with the same data.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius } from '../../config/theme';
import { COUNTRIES_BY_NUMERIC, colorForRate, topInsecure } from '../../data/insecurityByCountry';
import { POINTS } from '../../data/impactMap';
import { ensureWorldGeo } from './leafletLoader';

// Group BN presence (chapters / fridges / gap cities) by country
// ISO3 so the hover popup can show "you have 1 chapter and 2
// fridges in this country" with no extra computation.
function buildPresenceByIso3(fridges) {
  const map = {};
  POINTS.forEach((p) => {
    if (!p.country) return;
    if (!map[p.country]) map[p.country] = { chapters: 0, gap: 0, fridges: 0 };
    if (p.kind === 'chapter') map[p.country].chapters += 1;
    if (p.kind === 'gap')     map[p.country].gap += 1;
  });
  (fridges || []).forEach((f) => {
    const iso = f.country || 'USA';
    if (!map[iso]) map[iso] = { chapters: 0, gap: 0, fridges: 0 };
    map[iso].fridges += 1;
  });
  return map;
}

// ────────────────────────────────────────────────────────────────
//  WEB renderer — Robinson choropleth via d3
// ────────────────────────────────────────────────────────────────
function WebRobinson({ presence }) {
  const wrapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const [size, setSize] = useState({ w: 980, h: 520 });

  // Track wrapper width so the SVG stays crisp on any screen.
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(300, Math.round(e.contentRect.width));
        // Robinson aspect ratio ≈ 1.97. Keep the canvas at that ratio.
        setSize({ w, h: Math.round(w / 1.97) });
      }
    });
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  // Resolve the geo bundle once.
  useEffect(() => {
    let cancelled = false;
    ensureWorldGeo()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // Build the country paths once we have d3 + world.
  const features = useMemo(() => {
    if (!ready || typeof window === 'undefined' || !window.__bnWorldGeo) return null;
    const { topojson, world } = window.__bnWorldGeo;
    return topojson.feature(world, world.objects.countries).features;
  }, [ready]);

  const paths = useMemo(() => {
    if (!features || !window.__bnWorldGeo) return null;
    const { d3 } = window.__bnWorldGeo;
    const projection = d3.geoRobinson().fitSize([size.w, size.h], { type: 'Sphere' });
    const path = d3.geoPath(projection);
    return features.map((f) => {
      const numId = String(f.id).padStart(3, '0');
      const meta = COUNTRIES_BY_NUMERIC[numId];
      return { d: path(f), numId, meta };
    });
  }, [features, size]);

  if (error) {
    return (
      <View style={[styles.fallback, { minHeight: 360 }]}>
        <Text style={styles.fallbackTitle}>Map couldn't load</Text>
        <Text style={styles.fallbackBody}>{error}.</Text>
      </View>
    );
  }

  return React.createElement('div',
    { ref: wrapRef, style: { position: 'relative', width: '100%' } },
    React.createElement('svg', {
      viewBox: `0 0 ${size.w} ${size.h}`,
      width: '100%',
      style: { display: 'block', borderRadius: 14, background: '#F7F5EF' },
    },
      // Ocean / sphere outline
      React.createElement('rect', { x: 0, y: 0, width: size.w, height: size.h, fill: '#F7F5EF' }),
      paths
        ? paths.map((p) => {
            const rate = p.meta?.rate;
            const fill = colorForRate(rate);
            const isHover = hover?.numId === p.numId;
            return React.createElement('path', {
              key: p.numId,
              d: p.d,
              fill,
              stroke: isHover ? Colors.green : '#FFFFFFA0',
              strokeWidth: isHover ? 1.8 : 0.6,
              style: { cursor: 'pointer', transition: 'stroke-width 120ms' },
              onMouseEnter: () => setHover({ numId: p.numId, meta: p.meta }),
              onMouseLeave: () => setHover((h) => (h?.numId === p.numId ? null : h)),
            });
          })
        : null,
    ),
    !ready ? React.createElement('div',
      {
        style: {
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#F7F5EFCC', borderRadius: 14,
          flexDirection: 'column', gap: 8,
        },
      },
      React.createElement('div', { style: { color: '#7A766C', fontSize: 13, fontWeight: 600 } }, 'Loading world map…'),
    ) : null,
    hover?.meta ? React.createElement('div',
      {
        style: {
          position: 'absolute', top: 12, right: 12,
          background: '#FFFFFFF2',
          border: `1px solid ${Colors.glassBorder}`,
          borderRadius: 14, padding: '14px 16px',
          minWidth: 240, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
        },
      },
      React.createElement('div', { style: { fontSize: 11, color: '#7A766C', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' } }, 'Country'),
      React.createElement('div', { style: { fontSize: 18, fontWeight: 800, color: '#1B3A2D', marginTop: 2 } }, hover.meta.name),
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 10 } },
        React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: colorForRate(hover.meta.rate) } }, `${hover.meta.rate}%`),
        React.createElement('div', { style: { fontSize: 11, color: '#7A766C', fontWeight: 600 } }, 'food insecure'),
      ),
      React.createElement('div', { style: { marginTop: 12, borderTop: '1px solid #EDE7D6', paddingTop: 10, fontSize: 12, color: '#1B3A2D' } },
        React.createElement('div', null, `Chapters: ${presence[hover.meta.iso3]?.chapters || 0}`),
        React.createElement('div', { style: { marginTop: 2 } }, `Community fridges: ${presence[hover.meta.iso3]?.fridges || 0}`),
        React.createElement('div', { style: { marginTop: 2 } }, `Gap cities: ${presence[hover.meta.iso3]?.gap || 0}`),
      ),
    ) : hover && !hover.meta ? React.createElement('div',
      {
        style: {
          position: 'absolute', top: 12, right: 12,
          background: '#FFFFFFF2',
          border: `1px solid ${Colors.glassBorder}`,
          borderRadius: 14, padding: '12px 14px',
          minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
        },
      },
      React.createElement('div', { style: { fontSize: 12, color: '#7A766C', fontStyle: 'italic' } }, 'No insecurity data for this country yet'),
    ) : null,
  );
}

// ────────────────────────────────────────────────────────────────
//  NATIVE renderer — same data as a sorted list
// ────────────────────────────────────────────────────────────────
function NativeList({ presence }) {
  const sorted = useMemo(
    () => Object.values(COUNTRIES_BY_NUMERIC).sort((a, b) => b.rate - a.rate),
    []
  );
  return (
    <ScrollView style={{ maxHeight: 520 }}>
      {sorted.map((c) => (
        <View key={c.iso3} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: colorForRate(c.rate) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{c.name}</Text>
            <Text style={styles.rowSub}>
              {presence[c.iso3]?.chapters || 0} chapters · {presence[c.iso3]?.fridges || 0} fridges · {presence[c.iso3]?.gap || 0} gap cities
            </Text>
          </View>
          <Text style={styles.rowRate}>{c.rate}%</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function WorldInsecurityMap({ fridges = [] }) {
  const presence = useMemo(() => buildPresenceByIso3(fridges), [fridges]);
  const top = useMemo(() => topInsecure(10), []);
  return (
    <View>
      {Platform.OS === 'web'
        ? <WebRobinson presence={presence} />
        : <NativeList presence={presence} />}

      {/* Legend */}
      <View style={styles.legendRow}>
        {[
          { color: '#FBCFE8', label: '< 8%' },
          { color: '#F472B6', label: '8–15%' },
          { color: '#EC4899', label: '15–25%' },
          { color: '#DB2777', label: '25–40%' },
          { color: '#9D174D', label: '40–60%' },
          { color: '#831843', label: '≥ 60%' },
          { color: '#E9E4D4', label: 'no data' },
        ].map((b) => (
          <View key={b.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: b.color }]} />
            <Text style={styles.legendText}>{b.label}</Text>
          </View>
        ))}
      </View>

      {/* Top-N insecure rail */}
      <Text style={styles.railTitle}>Where the gap is widest</Text>
      <View style={styles.railRow}>
        {top.map((c) => (
          <View key={c.iso3} style={styles.railCell}>
            <View style={[styles.railDot, { backgroundColor: colorForRate(c.rate) }]} />
            <Text style={styles.railRate}>{c.rate}%</Text>
            <Text style={styles.railName} numberOfLines={1}>{c.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#FEF2F2', borderRadius: Radius.lg, padding: 24, alignItems: 'center', justifyContent: 'center' },
  fallbackTitle: { fontSize: 16, fontWeight: '800', color: Colors.pink, marginBottom: 4 },
  fallbackBody: { ...Type.body, color: Colors.gray, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDE7D6' },
  swatch: { width: 16, height: 16, borderRadius: 4 },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.green },
  rowSub: { ...Type.caption },
  rowRate: { fontSize: 16, fontWeight: '800', color: Colors.pink },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 11, color: Colors.gray, fontWeight: '600' },

  railTitle: { fontSize: 13, fontWeight: '700', color: Colors.green, marginTop: 22, marginBottom: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  railRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  railCell: {
    flexBasis: '18%', minWidth: 96, alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  railDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  railRate: { fontSize: 18, fontWeight: '800', color: Colors.green },
  railName: { fontSize: 10, fontWeight: '700', color: Colors.gray, marginTop: 2, letterSpacing: 0.3, textAlign: 'center' },
});
