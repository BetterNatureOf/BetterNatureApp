import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import {
  fetchAllHotspots,
  searchInsecurityByLocation,
  getInsecuritySummary,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '../../services/foodInsecurity';

const VIEW_TABS = [
  { key: 'all', label: 'All' },
  { key: 'us', label: 'United States' },
  { key: 'global', label: 'Global' },
];

const SORT_OPTIONS = [
  { key: 'insecurityRate', label: 'Severity' },
  { key: 'population', label: 'Population' },
  { key: 'childRate', label: 'Child Hunger' },
];

function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPop(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default function FoodInsecurityMap({ navigation }) {
  const { isWide } = useBreakpoint();
  const [view, setView] = useState('all');
  const [sortBy, setSortBy] = useState('insecurityRate');
  const [search, setSearch] = useState('');
  const [hotspots, setHotspots] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [view, sortBy]);

  async function load() {
    setLoading(true);
    try {
      const [data, stats] = await Promise.all([
        fetchAllHotspots({ view, sortBy }),
        getInsecuritySummary(),
      ]);
      setHotspots(data);
      setSummary(stats);
    } catch (e) {}
    setLoading(false);
  }

  async function handleSearch(text) {
    setSearch(text);
    if (text.trim().length < 2) {
      load();
      return;
    }
    setLoading(true);
    try {
      const results = await searchInsecurityByLocation(text);
      setHotspots(results);
    } catch (e) {}
    setLoading(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={900}>
        {/* Back */}
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'\u2039'} Back to IRIS</Text>
        </TouchableOpacity>

        {/* Hero */}
        <LinearGradient
          colors={['#DC2626', '#EA580C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroDecor} />
          <Text style={styles.heroEyebrow}>IRIS {'\u00B7'} FOOD RESCUE INTELLIGENCE</Text>
          <BrushText variant="screenTitle" style={styles.heroTitle}>
            Food Insecurity Hotspots
          </BrushText>
          <Text style={styles.heroSubtitle}>
            Real-time data from USDA, Feeding America, and the World Food Programme.
            See where donations are needed most.
          </Text>
        </LinearGradient>

        {/* Summary Stats */}
        {summary && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNum, { color: '#DC2626' }]}>{summary.usCritical}</Text>
              <Text style={styles.summaryLabel}>US Critical Zones</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNum, { color: '#F59E0B' }]}>{summary.globalEmergency}</Text>
              <Text style={styles.summaryLabel}>Global Crises</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNum, { color: Colors.green }]}>{summary.avgUSRate}%</Text>
              <Text style={styles.summaryLabel}>Avg US Rate</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNum, { color: Colors.sky }]}>{summary.avgGlobalRate}%</Text>
              <Text style={styles.summaryLabel}>Avg Global Rate</Text>
            </View>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>{'\u{1F50D}'}</Text>
          <TextInput
            value={search}
            onChangeText={handleSearch}
            placeholder="Search by city, state, or country..."
            placeholderTextColor={Colors.grayMid}
            style={styles.searchInput}
          />
        </View>

        {/* View Tabs */}
        <View style={styles.tabRow}>
          {VIEW_TABS.map((tab) => {
            const active = view === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => { setView(tab.key); setSearch(''); }}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sort */}
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by</Text>
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            if (opt.key === 'childRate' && view === 'global') return null;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setSortBy(opt.key)}
                style={[styles.sortChip, active && styles.sortChipActive]}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          {['critical', 'high', 'moderate', 'crisis', 'stressed'].map((sev) => (
            <View key={sev} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SEVERITY_COLORS[sev] || Colors.gray }]} />
              <Text style={styles.legendText}>{SEVERITY_LABELS[sev] || sev}</Text>
            </View>
          ))}
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.green} size="large" />
          </View>
        )}

        {/* Results */}
        {!loading && (
          <View style={[styles.list, isWide && styles.listWide]}>
            {hotspots.map((spot) => (
              <HotspotCard key={spot.id} spot={spot} wide={isWide} />
            ))}
          </View>
        )}

        {!loading && hotspots.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>{'\u{1F30D}'}</Text>
            <Text style={styles.emptyText}>No results found. Try a different search or filter.</Text>
          </View>
        )}

        {/* Sources */}
        <View style={styles.sourcesCard}>
          <Text style={styles.sourcesTitle}>Data Sources</Text>
          <Text style={styles.sourceItem}>{'\u2022'} USDA Food Access Research Atlas (food desert census tracts)</Text>
          <Text style={styles.sourceItem}>{'\u2022'} Feeding America Map the Meal Gap (county-level insecurity rates)</Text>
          <Text style={styles.sourceItem}>{'\u2022'} USDA Food Environment Atlas (per-county food environment)</Text>
          <Text style={styles.sourceItem}>{'\u2022'} WFP HungerMap LIVE (global real-time food insecurity)</Text>
          <Text style={styles.sourceCaption}>
            Data is updated periodically. Rates reflect the most recent available government and NGO datasets.
          </Text>
        </View>
      </ResponsiveContainer>
    </ScrollView>
  );
}

function HotspotCard({ spot, wide }) {
  const isUS = !!spot.state;
  const sevColor = SEVERITY_COLORS[spot.severity] || Colors.gray;
  const name = isUS ? spot.name : spot.country;
  const subLabel = isUS ? spot.state : spot.region;

  return (
    <View style={[styles.card, wide && styles.cardWide]}>
      {/* Severity strip */}
      <View style={[styles.sevStrip, { backgroundColor: sevColor }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{name}</Text>
            <Text style={styles.cardSub}>{subLabel} {'\u00B7'} {isUS ? spot.type : 'country'}</Text>
          </View>
          <View style={[styles.sevBadge, { backgroundColor: sevColor + '18' }]}>
            <View style={[styles.sevBadgeDot, { backgroundColor: sevColor }]} />
            <Text style={[styles.sevBadgeText, { color: sevColor }]}>
              {SEVERITY_LABELS[spot.severity]}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={[styles.metricNum, { color: sevColor }]}>
              {fmtPct(spot.insecurityRate)}
            </Text>
            <Text style={styles.metricLabel}>Insecurity Rate</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricNum}>{fmtPop(spot.population)}</Text>
            <Text style={styles.metricLabel}>Population</Text>
          </View>
          {isUS && spot.childRate && (
            <>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={[styles.metricNum, { color: '#EA580C' }]}>
                  {fmtPct(spot.childRate)}
                </Text>
                <Text style={styles.metricLabel}>Child Hunger</Text>
              </View>
            </>
          )}
          {!isUS && spot.fcsScore != null && (
            <>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricNum}>{spot.fcsScore}</Text>
                <Text style={styles.metricLabel}>FCS Score</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.coordRow}>
          <Text style={styles.coordText}>
            {spot.lat.toFixed(2)}{'\u00B0'}N, {Math.abs(spot.lng).toFixed(2)}{'\u00B0'}{spot.lng >= 0 ? 'E' : 'W'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 15, color: Colors.green, marginBottom: 14, fontWeight: '500' },

  hero: {
    borderRadius: Radius.xl,
    padding: 28,
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroDecor: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroEyebrow: { ...Type.eyebrow, color: 'rgba(255,255,255,0.6)', fontSize: 10, marginBottom: 8 },
  heroTitle: { color: Colors.white, fontSize: 28 },
  heroSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 21, marginTop: 8 },

  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  summaryNum: { fontSize: 22, fontWeight: '800', fontFamily: 'Caveat-Bold' },
  summaryLabel: { fontSize: 10, color: Colors.gray, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.grayLight,
    height: 48,
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.dark },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.grayLight,
  },
  tabActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.dark },
  tabTextActive: { color: Colors.white },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sortLabel: { ...Type.eyebrow, color: Colors.grayMid, fontSize: 10 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.grayFaint,
  },
  sortChipActive: { backgroundColor: Colors.greenLight },
  sortChipText: { fontSize: 12, fontWeight: '600', color: Colors.gray },
  sortChipTextActive: { color: Colors.green },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.gray, fontWeight: '500' },

  loadingWrap: { paddingVertical: 60, alignItems: 'center' },

  list: { flexDirection: 'column', gap: 12 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  cardWide: { flexBasis: '48%', flexGrow: 1, minWidth: 320 },
  sevStrip: { height: 3, width: '100%' },
  cardBody: { padding: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  cardName: { fontSize: 17, fontWeight: '700', color: Colors.dark, letterSpacing: -0.2 },
  cardSub: { fontSize: 12, color: Colors.grayMid, fontWeight: '500', marginTop: 2, textTransform: 'capitalize' },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 5,
  },
  sevBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  sevBadgeText: { fontSize: 11, fontWeight: '700' },

  metricsRow: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, alignItems: 'center' },
  metricNum: { fontSize: 18, fontWeight: '800', color: Colors.dark, fontFamily: 'Caveat-Bold' },
  metricLabel: { fontSize: 10, color: Colors.grayMid, fontWeight: '500', marginTop: 2 },
  metricDivider: { width: 1, height: 28, backgroundColor: Colors.grayLight, opacity: 0.5 },

  coordRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.grayLight + '60' },
  coordText: { fontSize: 11, color: Colors.grayMid, fontWeight: '500', fontStyle: 'italic' },

  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 40,
    alignItems: 'center',
    ...Shadows.soft,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { ...Type.body, color: Colors.gray, textAlign: 'center' },

  sourcesCard: {
    marginTop: 28,
    padding: 20,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  sourcesTitle: { ...Type.eyebrow, color: Colors.green, fontSize: 10, marginBottom: 10 },
  sourceItem: { fontSize: 12, color: Colors.gray, lineHeight: 20 },
  sourceCaption: { fontSize: 11, color: Colors.grayMid, fontStyle: 'italic', marginTop: 10 },
});
