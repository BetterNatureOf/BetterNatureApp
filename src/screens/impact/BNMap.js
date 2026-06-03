// BN Map — the unified BetterNature map.
//
//   Tab 1: Food Insecurity — hex tilegram colored by state-level rate
//          (Feeding America 2022). Hover any state for live BN
//          presence stats (chapters / fridges / gap cities).
//   Tab 2: Fridges — community-fridge dropoff network on a US plane
//          with hover tooltips for every fridge.
//
// Both tabs feed off the same data layers the marketing site uses,
// so the in-app map and the public map always tell the same story.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Screen from '../../components/ui/Screen';
import { POINTS, loadLiveFridges } from '../../data/impactMap';
import USInsecurityMap from '../../components/maps/USInsecurityMap';
import FridgeNetworkMap from '../../components/maps/FridgeNetworkMap';

const TABS = [
  { key: 'insecurity', label: 'Food Insecurity' },
  { key: 'fridges',    label: 'Fridges' },
];

export default function BNMap({ navigation }) {
  const [tab, setTab] = useState('insecurity');
  const [fridges, setFridges] = useState([]);

  useEffect(() => {
    let alive = true;
    loadLiveFridges()
      .then((list) => { if (alive) setFridges(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const gaps = useMemo(() => POINTS.filter((p) => p.kind === 'gap'), []);

  const startChapter = (city, state) => {
    const subject = encodeURIComponent(`Start a chapter in ${city}, ${state}`);
    const body = encodeURIComponent(
      `Hi BetterNature team,\n\nI'd like to start a chapter in ${city}. Please send me the playbook.\n\n`
    );
    Linking.openURL(`mailto:info@betternatureofficial.org?subject=${subject}&body=${body}`);
  };

  return (
    <Screen contentStyle={styles.content}>
      <ResponsiveContainer maxWidth={1200}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack?.()}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.eyebrow}>Where we work. Where we don't.</Text>
        <BrushText variant="screenTitle" style={styles.title}>BN Map</BrushText>
        <Text style={styles.body}>
          Two views on the same fight. Switch between the food-insecurity heatmap
          and the live fridge network.
        </Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Map surface */}
        <View style={styles.surface}>
          {tab === 'insecurity'
            ? <USInsecurityMap fridges={fridges} />
            : <FridgeNetworkMap fridges={fridges} />}
        </View>

        {/* Gap recruiting rail — surfaces the same call-to-action the
            old ImpactMap had, so anyone hovering a high-insecurity
            state can immediately email us to start a chapter. */}
        {tab === 'insecurity' ? (
          <View style={{ marginTop: 28 }}>
            <Text style={styles.sectionTitle}>The gap — cities ready for a chapter</Text>
            <View style={styles.gapGrid}>
              {gaps.map((g) => (
                <View key={`${g.city}-${g.state}`} style={styles.gapCard}>
                  <Text style={styles.gapCity}>{g.city}</Text>
                  <Text style={styles.gapState}>{g.state} · {g.insecurity}% food insecure</Text>
                  <TouchableOpacity style={styles.gapCta} onPress={() => startChapter(g.city, g.state)}>
                    <Text style={styles.gapCtaText}>Start a chapter →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ResponsiveContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  headerRow: { marginBottom: 8 },
  back: { fontSize: 16, color: Colors.green },
  eyebrow: { ...Type.caption, color: Colors.pink, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8, marginBottom: 6 },
  title: { color: Colors.green, fontSize: 40, marginBottom: 8 },
  body: { ...Type.body, color: Colors.gray, lineHeight: 22, marginBottom: 18 },

  tabs: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.pill, padding: 4, alignSelf: 'flex-start', marginBottom: 18, borderWidth: 1, borderColor: Colors.glassBorder },
  tab: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill },
  tabActive: { backgroundColor: Colors.green },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.gray, letterSpacing: 0.3 },
  tabTextActive: { color: '#FFF' },

  surface: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Platform.OS === 'web' ? 18 : 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.green, marginBottom: 12 },
  gapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gapCard: {
    flexGrow: 1, flexBasis: 220, minWidth: 220,
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 16,
    borderLeftWidth: 4, borderLeftColor: Colors.pink,
    borderWidth: 1, borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  gapCity: { fontSize: 17, fontWeight: '800', color: Colors.green },
  gapState: { fontSize: 12, color: Colors.grayMid, marginTop: 2 },
  gapCta: { marginTop: 12, backgroundColor: Colors.pink, paddingVertical: 10, borderRadius: Radius.pill, alignItems: 'center' },
  gapCtaText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
