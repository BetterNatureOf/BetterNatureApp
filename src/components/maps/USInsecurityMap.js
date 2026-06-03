// Big interactive US food-insecurity map. Hex-tilegram layout —
// every state is the same size, arranged roughly geographically.
// Color = food insecurity rate (see colorForRate). On web, hovering
// any state surfaces a stat card with rate + BetterNature presence
// in that state (chapters / fridges / gap cities).
//
// On native we render a sorted list with the same stats — same
// data, different layout.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { Colors, Type } from '../../config/theme';
import { STATES, colorForRate, topInsecure } from '../../data/insecurityByState';
import { POINTS } from '../../data/impactMap';

// Group BetterNature presence by state so hover-over shows real
// stats: how many chapters / gap cities / fridges live there.
function buildPresenceByState(fridges) {
  const map = {};
  STATES.forEach((s) => { map[s.code] = { chapters: 0, gap: 0, fridges: 0 }; });
  POINTS.forEach((p) => {
    if (!p.state || !map[p.state]) return;
    if (p.kind === 'chapter') map[p.state].chapters += 1;
    if (p.kind === 'gap')     map[p.state].gap += 1;
  });
  (fridges || []).forEach((f) => {
    if (f.state && map[f.state]) map[f.state].fridges += 1;
  });
  return map;
}

// ────────────────────────────────────────────────────────────────
//  WEB renderer — true interactive hex tilegram
// ────────────────────────────────────────────────────────────────
function WebTilegram({ presence }) {
  const [hover, setHover] = useState(null);

  // Layout constants. The hex grid uses offset rows so the visual
  // staggering reads as a real US shape.
  const HEX_W = 78;     // width of each hex (px)
  const HEX_H = 88;     // vertical hex stride
  const STAGGER = HEX_W / 2;

  const maxCol = Math.max(...STATES.map((s) => s.col));
  const maxRow = Math.max(...STATES.map((s) => s.row));
  const width  = (maxCol + 2) * HEX_W;
  const height = (maxRow + 2) * (HEX_H * 0.86);

  return React.createElement(
    'div',
    {
      style: {
        position: 'relative',
        width: '100%',
        // Cap so the map stays readable on ultrawide; below the cap
        // it can stretch to the column width inside ResponsiveContainer.
        maxWidth: width,
        margin: '0 auto',
        aspectRatio: `${width} / ${height}`,
      },
    },
    React.createElement(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        width: '100%',
        height: '100%',
        style: { display: 'block' },
      },
      STATES.map((s) => {
        const stag = (Math.floor(s.row) % 2 === 1) ? STAGGER : 0;
        const cx = s.col * HEX_W + stag + HEX_W / 2;
        const cy = s.row * HEX_H * 0.86 + HEX_H / 2;
        const r  = HEX_W * 0.48;
        const points = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          points.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
        }
        const fill = colorForRate(s.rate);
        const hovered = hover?.code === s.code;
        return React.createElement('g', { key: s.code },
          React.createElement('polygon', {
            points: points.join(' '),
            fill,
            stroke: hovered ? Colors.green : '#FFFFFFAA',
            strokeWidth: hovered ? 3 : 1.5,
            onMouseEnter: () => setHover(s),
            onMouseLeave: () => setHover((h) => (h?.code === s.code ? null : h)),
            style: { cursor: 'pointer', transition: 'stroke 120ms' },
          }),
          React.createElement('text', {
            x: cx, y: cy + 4, textAnchor: 'middle',
            fontSize: 13, fontWeight: 700,
            fill: s.rate >= 15 ? '#FFFFFF' : '#1B3A2D',
            pointerEvents: 'none',
            style: { userSelect: 'none' },
          }, s.code),
          React.createElement('text', {
            x: cx, y: cy + 19, textAnchor: 'middle',
            fontSize: 9, fontWeight: 600,
            fill: s.rate >= 15 ? '#FFFFFFCC' : '#1B3A2D99',
            pointerEvents: 'none',
            style: { userSelect: 'none' },
          }, `${s.rate}%`),
        );
      })
    ),
    hover ? React.createElement(
      'div',
      {
        style: {
          position: 'absolute',
          top: 12, right: 12,
          background: '#FFFFFFF2',
          border: `1px solid ${Colors.glassBorder}`,
          borderRadius: 14,
          padding: '14px 16px',
          minWidth: 220,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
        },
      },
      React.createElement('div', { style: { fontSize: 11, color: '#7A766C', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' } }, 'State'),
      React.createElement('div', { style: { fontSize: 18, fontWeight: 800, color: '#1B3A2D', marginTop: 2 } }, hover.name),
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 10 } },
        React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: colorForRate(hover.rate) } }, `${hover.rate}%`),
        React.createElement('div', { style: { fontSize: 11, color: '#7A766C', fontWeight: 600 } }, 'food insecure'),
      ),
      React.createElement('div', { style: { marginTop: 12, borderTop: '1px solid #EDE7D6', paddingTop: 10, fontSize: 12, color: '#1B3A2D' } },
        React.createElement('div', null, `Chapters: ${presence[hover.code]?.chapters || 0}`),
        React.createElement('div', { style: { marginTop: 2 } }, `Community fridges: ${presence[hover.code]?.fridges || 0}`),
        React.createElement('div', { style: { marginTop: 2 } }, `Gap cities: ${presence[hover.code]?.gap || 0}`),
      ),
    ) : null,
  );
}

// ────────────────────────────────────────────────────────────────
//  NATIVE renderer — same data as a tappable sorted list
// ────────────────────────────────────────────────────────────────
function NativeList({ presence }) {
  const sorted = useMemo(() => [...STATES].sort((a, b) => b.rate - a.rate), []);
  return (
    <ScrollView style={{ maxHeight: 480 }}>
      {sorted.map((s) => (
        <View key={s.code} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: colorForRate(s.rate) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{s.name}</Text>
            <Text style={styles.rowSub}>
              {presence[s.code]?.chapters || 0} chapters · {presence[s.code]?.fridges || 0} fridges · {presence[s.code]?.gap || 0} gap cities
            </Text>
          </View>
          <Text style={styles.rowRate}>{s.rate}%</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function USInsecurityMap({ fridges = [] }) {
  const presence = useMemo(() => buildPresenceByState(fridges), [fridges]);
  const top = useMemo(() => topInsecure(10), []);
  return (
    <View>
      {Platform.OS === 'web'
        ? <WebTilegram presence={presence} />
        : <NativeList presence={presence} />}

      {/* Legend */}
      <View style={styles.legendRow}>
        {[
          { color: '#FDF2F8', label: '< 9%' },
          { color: '#FBCFE8', label: '9–11%' },
          { color: '#F472B6', label: '11–13%' },
          { color: '#EC4899', label: '13–15%' },
          { color: '#DB2777', label: '15–18%' },
          { color: '#9D174D', label: '≥ 18%' },
        ].map((b) => (
          <View key={b.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: b.color }]} />
            <Text style={styles.legendText}>{b.label}</Text>
          </View>
        ))}
      </View>

      {/* Top-N insecure rail (visible on both platforms) */}
      <Text style={styles.railTitle}>Where the gap is widest</Text>
      <View style={styles.railRow}>
        {top.map((s) => (
          <View key={s.code} style={styles.railCell}>
            <View style={[styles.railDot, { backgroundColor: colorForRate(s.rate) }]} />
            <Text style={styles.railRate}>{s.rate}%</Text>
            <Text style={styles.railName}>{s.code}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexBasis: '18%', minWidth: 76, alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  railDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  railRate: { fontSize: 18, fontWeight: '800', color: Colors.green },
  railName: { fontSize: 11, fontWeight: '700', color: Colors.gray, marginTop: 2, letterSpacing: 0.6 },
});
