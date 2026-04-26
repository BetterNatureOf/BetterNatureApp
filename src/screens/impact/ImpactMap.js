// ═══════════════════════════════════════════════════════════════════════════
//  Impact Map — replaces FoodInsecurityMap
//  Shows all 5 program layers (chapters, gap, partners, plantings, cleanups)
//  on a single filterable list. The "gap" (high-need, no-chapter cities) is
//  the headline: every gap card is a recruiting call to start a chapter.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking,
} from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import { LAYERS, COPY, POINTS, aggregate } from '../../data/impactMap';

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'gap',      label: 'The Gap' },
  { key: 'chapter',  label: 'Chapters' },
  { key: 'partner',  label: 'Partners' },
  { key: 'planting', label: 'Plantings' },
  { key: 'cleanup',  label: 'Cleanups' },
];

const fmt = (n) => {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
};

const colorFor = (kind) => LAYERS.find(l => l.key === kind)?.color || Colors.green;

export default function ImpactMap({ navigation }) {
  const [filter, setFilter] = useState('all');

  const visible = useMemo(
    () => (filter === 'all' ? POINTS : POINTS.filter(p => p.kind === filter)),
    [filter]
  );
  const agg = useMemo(() => aggregate(visible), [visible]);
  const gaps = POINTS.filter(p => p.kind === 'gap');

  const startChapter = (p) => {
    const subject = encodeURIComponent(`Start a chapter in ${p.city}, ${p.state}`);
    const body = encodeURIComponent(
      `Hi Better Nature team,\n\nI'd like to start a chapter in ${p.city}. Please send me the playbook.\n\n`
    );
    Linking.openURL(`mailto:info@betternatureofficial.org?subject=${subject}&body=${body}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>{COPY.eyebrow}</Text>
        <Text style={styles.title}>{COPY.title}</Text>
        <Text style={styles.body}>{COPY.body}</Text>
      </View>

      {/* THE GAP — headline card */}
      <View style={styles.gapCard}>
        <Text style={styles.gapLabel}>The gap we're closing</Text>
        <Text style={styles.gapNum}>{gaps.length}</Text>
        <Text style={styles.gapSub}>
          cities with high food insecurity and no chapter yet
        </Text>
        <TouchableOpacity
          style={styles.gapCta}
          onPress={() => setFilter('gap')}
        >
          <Text style={styles.gapCtaText}>See the gap →</Text>
        </TouchableOpacity>
      </View>

      {/* Live stats rail */}
      <View style={styles.statsRow}>
        <Stat label="Chapters"  value={agg.chapters} />
        <Stat label="Meals"     value={fmt(agg.meals)} />
        <Stat label="Trees"     value={fmt(agg.trees)} />
        <Stat label="Gallons"   value={fmt(agg.gallons)} />
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.pill, filter === f.key && styles.pillActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.pillText, filter === f.key && styles.pillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Points list */}
      <View style={styles.list}>
        {visible.map((p, i) => (
          <PointCard key={`${p.kind}-${i}`} p={p} onStartChapter={startChapter} />
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PointCard({ p, onStartChapter }) {
  const accent = colorFor(p.kind);
  const kindLabel = LAYERS.find(l => l.key === p.kind)?.label || p.kind;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Text style={[styles.cardKind, { color: accent }]}>{kindLabel}</Text>
      <Text style={styles.cardTitle}>
        {p.kind === 'partner' ? p.name
         : p.kind === 'planting' || p.kind === 'cleanup' ? p.site
         : `${p.city}, ${p.state}`}
      </Text>
      {(p.kind === 'partner' || p.kind === 'planting' || p.kind === 'cleanup') && (
        <Text style={styles.cardSub}>{p.city}, {p.state}{p.date ? ` · ${p.date}` : ''}</Text>
      )}

      {p.kind === 'chapter' && (
        <View style={styles.cardStats}>
          <Mini v={p.members}           l="members" />
          <Mini v={fmt(p.meals)}        l="meals" />
          <Mini v={fmt(p.trees)}        l="trees" />
          <Mini v={fmt(p.gallons)}      l="gal cleaned" />
        </View>
      )}

      {p.kind === 'gap' && (
        <>
          <View style={styles.cardStats}>
            <Mini v={`${p.insecurity}%`} l="food insecure" />
            <Mini v={fmt(p.population)}  l="people" />
            <Mini v="0" l="chapters" warn />
          </View>
          <TouchableOpacity
            style={styles.cardCta}
            onPress={() => onStartChapter(p)}
          >
            <Text style={styles.cardCtaText}>Start a chapter in {p.city} →</Text>
          </TouchableOpacity>
        </>
      )}

      {p.kind === 'partner' && (
        <Text style={styles.cardFact}>{fmt(p.meals)} meals rescued to date</Text>
      )}
      {p.kind === 'planting' && (
        <Text style={styles.cardFact}>{fmt(p.trees)} native trees planted</Text>
      )}
      {p.kind === 'cleanup' && (
        <Text style={styles.cardFact}>{fmt(p.gallons)} gallons protected</Text>
      )}
    </View>
  );
}

function Mini({ v, l, warn }) {
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniV, warn && { color: Colors.pink }]}>{v}</Text>
      <Text style={styles.miniL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingBottom: 40 },
  header: { padding: 24, paddingTop: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 12 },
  eyebrow: { ...Type.caption, color: Colors.pink, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  title: { ...Type.screenTitle, color: Colors.green, fontSize: 36, marginBottom: 10 },
  body: { ...Type.body, color: Colors.gray, lineHeight: 22 },

  gapCard: {
    backgroundColor: Colors.green, marginHorizontal: 24, borderRadius: Radius.lg,
    padding: 24, alignItems: 'center', ...Shadows.card,
  },
  gapLabel: { color: Colors.pink, fontStyle: 'italic', fontSize: 14, marginBottom: 6 },
  gapNum: { color: Colors.cream, fontSize: 64, fontWeight: '300', fontFamily: Type.screenTitle?.fontFamily, lineHeight: 68 },
  gapSub: { color: Colors.cream, opacity: 0.8, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  gapCta: { backgroundColor: Colors.pink, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.pill },
  gapCtaText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 20, gap: 10 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: Radius.md, padding: 14, alignItems: 'center', ...Shadows.card },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.green },
  statLabel: { ...Type.caption, marginTop: 2 },

  filters: { paddingHorizontal: 24, paddingVertical: 20, gap: 8 },
  pill: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.grayLight || '#D9D9D9', marginRight: 8 },
  pillActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  pillText: { color: Colors.gray, fontWeight: '500', fontSize: 13 },
  pillTextActive: { color: '#fff' },

  list: { paddingHorizontal: 24 },
  card: {
    backgroundColor: '#fff', borderRadius: Radius.md, padding: 18, marginBottom: 12,
    borderLeftWidth: 4, ...Shadows.card,
  },
  cardKind: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Colors.green },
  cardSub: { ...Type.caption, marginTop: 2 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  mini: { minWidth: 70 },
  miniV: { fontSize: 16, fontWeight: '700', color: Colors.green },
  miniL: { ...Type.caption, marginTop: 1 },
  cardFact: { ...Type.body, color: Colors.gray, marginTop: 8 },
  cardCta: { marginTop: 14, backgroundColor: Colors.pink, paddingVertical: 12, borderRadius: Radius.pill, alignItems: 'center' },
  cardCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
