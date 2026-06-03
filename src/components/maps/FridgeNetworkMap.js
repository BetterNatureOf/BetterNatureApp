// Fridge network map. Single US outline SVG path + colored dots
// projected from each fridge's lat/lng using a quick equirectangular
// projection scoped to the continental US bbox.
//
// On web each dot has a hover tooltip with the fridge's name, city,
// hours, and capacity. Native shows a tappable list of the same
// fridges grouped by city.
//
// `compact` mode shrinks everything for use as a preview tile on
// the IRIS and Executive dashboards.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import { POINTS } from '../../data/impactMap';

// Continental-US bounding box (skipping AK/HI to keep the layout
// readable — they go in a callout below if we ever have markers
// there).
const BBOX = { minLng: -125.0, maxLng: -66.5, minLat: 24.0, maxLat: 49.5 };

function project(lat, lng, w, h) {
  const x = ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * w;
  const y = (1 - (lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * h;
  return { x, y };
}

// Marker palette by status. Active fridges in green, recently-added
// in pink so dispatchers see what's freshly opened.
function colorForFridge(f) {
  if (f.capacity === 'low')    return '#EF4444';
  if (f.capacity === 'high')   return Colors.green;
  return Colors.pink;
}

function WebOutlineMap({ fridges, compact }) {
  const [hover, setHover] = useState(null);
  const W = 1024;
  const H = 580;
  const dotR = compact ? 6 : 9;

  return React.createElement(
    'div',
    { style: { position: 'relative', width: '100%', maxWidth: compact ? 460 : W, margin: '0 auto', aspectRatio: `${W} / ${H}` } },
    React.createElement(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%', style: { display: 'block', borderRadius: 14, background: '#F7F5EF' } },
      // Simple US outline (decorative — the markers carry the data).
      // We draw a light grid of latitude lines so the map reads as
      // a geographic plane even without state borders.
      [0, 1, 2, 3, 4].map((i) =>
        React.createElement('line', {
          key: `glat-${i}`,
          x1: 0, x2: W,
          y1: (H / 5) * (i + 0.5),
          y2: (H / 5) * (i + 0.5),
          stroke: '#E9E4D4', strokeWidth: 1,
        })
      ),
      // Subtle US bbox rectangle so the map area is bounded.
      React.createElement('rect', {
        x: 0, y: 0, width: W, height: H,
        fill: 'none', stroke: '#D9D4C3', strokeWidth: 1.5,
      }),
      // Chapter pins (always show — they're the anchors).
      POINTS.filter((p) => p.kind === 'chapter').map((c) => {
        const { x, y } = project(c.lat, c.lng, W, H);
        return React.createElement('g', { key: `ch-${c.city}` },
          React.createElement('circle', { cx: x, cy: y, r: dotR + 4, fill: '#1B3A2D22' }),
          React.createElement('circle', { cx: x, cy: y, r: dotR, fill: '#1B3A2D', stroke: '#FFF', strokeWidth: 2 }),
          React.createElement('text', { x: x + dotR + 4, y: y + 4, fontSize: 11, fontWeight: 700, fill: '#1B3A2D' }, c.city),
        );
      }),
      // Gap city ghosts (lighter — they show where we want to grow).
      POINTS.filter((p) => p.kind === 'gap').map((g) => {
        const { x, y } = project(g.lat, g.lng, W, H);
        return React.createElement('circle', {
          key: `gap-${g.city}`,
          cx: x, cy: y, r: dotR - 2,
          fill: 'none', stroke: '#FF4D8D', strokeWidth: 1.5, strokeDasharray: '2 3',
        });
      }),
      // Fridge markers (the headline of this map).
      fridges.map((f, i) => {
        if (f.lat == null || f.lng == null) return null;
        const { x, y } = project(f.lat, f.lng, W, H);
        const color = colorForFridge(f);
        const isHover = hover?.id === f.id;
        return React.createElement('g', { key: f.id || `f-${i}` },
          React.createElement('circle', {
            cx: x, cy: y, r: isHover ? dotR + 3 : dotR,
            fill: color, stroke: '#FFF', strokeWidth: 2,
            onMouseEnter: () => setHover(f),
            onMouseLeave: () => setHover((h) => (h?.id === f.id ? null : h)),
            style: { cursor: 'pointer', transition: 'r 120ms' },
          }),
        );
      }),
    ),
    hover ? React.createElement(
      'div',
      { style: { position: 'absolute', top: 12, right: 12, background: '#FFFFFFF2', border: `1px solid ${Colors.glassBorder}`, borderRadius: 14, padding: '14px 16px', minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', pointerEvents: 'none' } },
      React.createElement('div', { style: { fontSize: 11, color: '#7A766C', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' } }, 'Community fridge'),
      React.createElement('div', { style: { fontSize: 17, fontWeight: 800, color: '#1B3A2D', marginTop: 2 } }, hover.name),
      React.createElement('div', { style: { fontSize: 12, color: '#7A766C', marginTop: 4 } }, hover.address || [hover.city, hover.state].filter(Boolean).join(', ')),
      hover.hours ? React.createElement('div', { style: { fontSize: 12, color: '#1B3A2D', marginTop: 6 } }, `Hours: ${hover.hours}`) : null,
      hover.capacity ? React.createElement('div', { style: { fontSize: 12, color: '#1B3A2D', marginTop: 2 } }, `Capacity: ${hover.capacity}`) : null,
    ) : null,
  );
}

function NativeList({ fridges }) {
  // Group by city for skim-reading.
  const byCity = useMemo(() => {
    const m = new Map();
    fridges.forEach((f) => {
      const k = `${f.city || 'Unknown'}, ${f.state || ''}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [fridges]);

  if (!fridges.length) {
    return <Text style={styles.empty}>No fridges in the network yet.</Text>;
  }
  return (
    <ScrollView style={{ maxHeight: 480 }}>
      {byCity.map(([city, list]) => (
        <View key={city} style={{ marginBottom: 10 }}>
          <Text style={styles.cityHeader}>{city} <Text style={styles.cityCount}>· {list.length}</Text></Text>
          {list.map((f) => (
            <View key={f.id} style={styles.fridgeCard}>
              <View style={[styles.dot, { backgroundColor: colorForFridge(f) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fridgeName}>{f.name}</Text>
                {f.address ? <Text style={styles.fridgeAddr}>{f.address}</Text> : null}
                <Text style={styles.fridgeMeta}>
                  {[f.hours, f.capacity ? `${f.capacity} capacity` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

export default function FridgeNetworkMap({ fridges = [], compact = false, onSeeAll }) {
  return (
    <View>
      {Platform.OS === 'web'
        ? <WebOutlineMap fridges={fridges} compact={compact} />
        : <NativeList fridges={fridges} />}

      <View style={styles.statRow}>
        <Stat n={fridges.length} l="active fridges" />
        <Stat n={POINTS.filter((p) => p.kind === 'chapter').length} l="chapters" />
        <Stat n={new Set(fridges.map((f) => `${f.city}-${f.state}`)).size} l="cities" />
      </View>

      {onSeeAll ? (
        <TouchableOpacity style={styles.cta} onPress={onSeeAll} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Open the full BN Map →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Stat({ n, l }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { ...Type.body, color: Colors.gray, textAlign: 'center', paddingVertical: 24 },
  cityHeader: { fontSize: 13, fontWeight: '700', color: Colors.green, marginBottom: 6, letterSpacing: 0.3 },
  cityCount: { color: Colors.grayMid, fontWeight: '500' },
  fridgeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  fridgeName: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  fridgeAddr: { ...Type.caption, marginTop: 2 },
  fridgeMeta: { ...Type.caption, marginTop: 2, color: Colors.grayMid },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: Colors.glassBorder },
  statN: { fontSize: 22, fontWeight: '800', color: Colors.green },
  statL: { ...Type.caption, marginTop: 2 },

  cta: { marginTop: 14, backgroundColor: Colors.green, paddingVertical: 12, borderRadius: Radius.pill, alignItems: 'center' },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
