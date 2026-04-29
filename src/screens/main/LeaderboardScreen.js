import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import { fetchLeaderboard } from '../../services/database';

const TIME_FILTERS = [
  { key: 'all', label: 'All time' },
  { key: 'year', label: 'Year' },
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
];

const PROJECT_FILTERS = [
  { key: 'all', label: 'All', color: Colors.green },
  { key: 'iris', label: 'IRIS', color: Colors.sage },
  { key: 'evergreen', label: 'Evergreen', color: Colors.green },
  { key: 'hydro', label: 'Hydro', color: Colors.skyDark || Colors.sky },
];

const SORT_FILTERS = [
  { key: 'overall', label: 'Overall' },
  { key: 'meals', label: 'Meals' },
  { key: 'hours', label: 'Hours' },
  { key: 'events', label: 'Events' },
  { key: 'raised', label: 'Raised' },
];

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function fmtMoney(n) {
  return `$${fmt(n)}`;
}

function metricValue(row, sortBy) {
  if (sortBy === 'raised') return fmtMoney(row.raised);
  if (sortBy === 'overall') return fmt(row.score);
  return fmt(row[sortBy]);
}

function metricLabel(sortBy) {
  if (sortBy === 'overall') return 'pts';
  if (sortBy === 'raised') return '';
  return sortBy;
}

export function LeaderboardBody({ embedded = false }) {
  const user = useAuthStore((s) => s.user);
  const { isWide } = useBreakpoint();

  const [timeRange, setTimeRange] = useState('all');
  const [project, setProject] = useState('all');
  const [sortBy, setSortBy] = useState('overall');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeaderboard({ timeRange, project, sortBy });
      setRows(data);
    } catch (e) {}
    setLoading(false);
  }, [timeRange, project, sortBy]);

  useEffect(() => {
    load();
  }, [load]);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const rest = useMemo(() => rows.slice(3), [rows]);
  const myRow = useMemo(
    () => rows.find((r) => r.user_id === user?.id),
    [rows, user]
  );

  return (
    <View>
      {!embedded && (
        <>
          <BrushText variant="screenTitle" style={styles.title}>
            Leaderboard
          </BrushText>
          <Text style={styles.subtitle}>
            See who's making the biggest impact across BetterNature.
          </Text>
        </>
      )}

      <FilterRow
        label="Time"
        options={TIME_FILTERS}
        value={timeRange}
        onChange={setTimeRange}
      />
      <FilterRow
        label="Project"
        options={PROJECT_FILTERS}
        value={project}
        onChange={setProject}
        colorize
      />
      <FilterRow
        label="Sort by"
        options={SORT_FILTERS}
        value={sortBy}
        onChange={setSortBy}
      />

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.green} />
        </View>
      )}

      {!loading && rows.length === 0 && (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyEmoji}>{'\u{1F331}'}</Text>
          </View>
          <Text style={styles.emptyText}>
            No activity matches these filters yet. Try widening the time
            range or picking a different project.
          </Text>
        </View>
      )}

      {!loading && top3.length > 0 && (
        <View style={styles.podiumWrap}>
          {top3[1] && (
            <PodiumCard
              rank={2}
              row={top3[1]}
              sortBy={sortBy}
              colors={['#A8B4C0', '#8E9AAA']}
              height={120}
            />
          )}
          {top3[0] && (
            <PodiumCard
              rank={1}
              row={top3[0]}
              sortBy={sortBy}
              colors={['#E8C44E', '#D4A72C']}
              height={150}
            />
          )}
          {top3[2] && (
            <PodiumCard
              rank={3}
              row={top3[2]}
              sortBy={sortBy}
              colors={['#D4956E', '#C07A3D']}
              height={100}
            />
          )}
        </View>
      )}

      {myRow && (
        <LinearGradient
          colors={Colors.gradient.green}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.youCard}
        >
          <Text style={styles.youLabel}>YOUR RANK</Text>
          <View style={styles.youRow}>
            <Text style={styles.youRank}>#{myRow.rank}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.youName}>{myRow.name}</Text>
              <Text style={styles.youChapter}>{myRow.chapter}</Text>
            </View>
            <View style={styles.youMetric}>
              <Text style={styles.youValue}>{metricValue(myRow, sortBy)}</Text>
              <Text style={styles.youUnit}>{metricLabel(sortBy)}</Text>
            </View>
          </View>
        </LinearGradient>
      )}

      {!loading && rest.length > 0 && (
        <View style={[styles.list, isWide && styles.listWide]}>
          {rest.map((row) => (
            <LeaderboardRow
              key={row.user_id}
              row={row}
              sortBy={sortBy}
              isMe={row.user_id === user?.id}
              wide={isWide}
            />
          ))}
        </View>
      )}

      <Text style={styles.footnote}>
        Overall score = meals + hours{'\u00D7'}8 + events{'\u00D7'}25 + dollars raised. Pickups,
        event check-ins, and donations all count automatically.
      </Text>
    </View>
  );
}

export default function LeaderboardScreen({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={900}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{'\u2039'} Back</Text>
          </TouchableOpacity>
        )}
        <LeaderboardBody />
      </ResponsiveContainer>
    </ScrollView>
  );
}

function FilterRow({ label, options, value, onChange, colorize = false }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {options.map((opt) => {
          const active = opt.key === value;
          const tint = colorize && opt.color ? opt.color : Colors.green;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onChange(opt.key)}
              activeOpacity={0.85}
              style={[
                styles.chip,
                active && { backgroundColor: tint, borderColor: tint },
              ]}
            >
              {active && colorize && <View style={[styles.chipDot, { backgroundColor: Colors.white }]} />}
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PodiumCard({ rank, row, sortBy, colors, height }) {
  return (
    <View style={styles.podiumCol}>
      <View style={styles.podiumAvatarWrap}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.podiumAvatarRing}
        >
          <View style={styles.podiumAvatar}>
            <Text style={styles.podiumInitial}>
              {row.name?.[0] || '?'}
            </Text>
          </View>
        </LinearGradient>
        <View style={[styles.medalDot, { backgroundColor: colors[0] }]}>
          <Text style={styles.medalText}>{rank}</Text>
        </View>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        {row.name}
      </Text>
      <Text style={styles.podiumChapter} numberOfLines={1}>
        {row.chapter}
      </Text>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.podiumBar, { height }]}
      >
        <Text style={styles.podiumValue}>{metricValue(row, sortBy)}</Text>
        <Text style={styles.podiumUnit}>{metricLabel(sortBy)}</Text>
      </LinearGradient>
    </View>
  );
}

function LeaderboardRow({ row, sortBy, isMe, wide }) {
  return (
    <View style={[styles.row, isMe && styles.rowMe, wide && styles.rowWide]}>
      <Text style={styles.rank}>#{row.rank}</Text>
      <LinearGradient
        colors={Colors.gradient.sage}
        style={styles.avatarSmall}
      >
        <Text style={styles.avatarSmallText}>{row.name?.[0] || '?'}</Text>
      </LinearGradient>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.rowChapter} numberOfLines={1}>
          {row.chapter}
        </Text>
      </View>
      <View style={styles.rowStats}>
        <Text style={styles.rowValue}>{metricValue(row, sortBy)}</Text>
        <Text style={styles.rowSub}>
          {fmt(row.meals)}m {'\u00B7'} {fmt(row.hours)}h {'\u00B7'} {fmtMoney(row.raised)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8, fontWeight: '500' },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 18 },

  filterRow: { marginBottom: 14 },
  filterLabel: {
    ...Type.eyebrow,
    color: Colors.grayMid,
    marginBottom: 8,
    fontSize: 10,
  },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.grayLight,
    backgroundColor: Colors.white,
    marginRight: 0,
    gap: 5,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  chipText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  chipTextActive: { color: Colors.white },

  loadingWrap: { paddingVertical: 40, alignItems: 'center' },

  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 32,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyEmoji: { fontSize: 28 },
  emptyText: { ...Type.body, color: Colors.gray, textAlign: 'center' },

  // Podium
  podiumWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 24,
  },
  podiumCol: { flex: 1, alignItems: 'center', maxWidth: 140 },
  podiumAvatarWrap: { alignItems: 'center', marginBottom: 6 },
  podiumAvatarRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  podiumInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.green,
  },
  medalDot: {
    position: 'absolute',
    bottom: -4,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Colors.cream,
  },
  medalText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  podiumName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.dark,
    textAlign: 'center',
  },
  podiumChapter: {
    fontSize: 11,
    color: Colors.grayMid,
    textAlign: 'center',
    marginBottom: 6,
  },
  podiumBar: {
    width: '100%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 80,
  },
  podiumValue: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Caveat-Bold',
  },
  podiumUnit: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },

  // You card
  youCard: {
    borderRadius: Radius.lg,
    padding: 18,
    marginBottom: 16,
  },
  youLabel: {
    color: 'rgba(255,255,255,0.55)',
    ...Type.eyebrow,
    fontSize: 10,
    marginBottom: 8,
  },
  youRow: { flexDirection: 'row', alignItems: 'center' },
  youRank: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    fontFamily: 'Caveat-Bold',
    minWidth: 48,
  },
  youName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  youChapter: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500' },
  youMetric: { alignItems: 'flex-end' },
  youValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  youUnit: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },

  // List
  list: { flexDirection: 'column', gap: 8 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.soft,
  },
  rowWide: { flexBasis: '47%', flexGrow: 1, minWidth: 280 },
  rowMe: { borderColor: Colors.pink, borderWidth: 2 },
  rank: {
    width: 36,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.grayMid,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  rowChapter: { fontSize: 11, color: Colors.grayMid },
  rowStats: { alignItems: 'flex-end' },
  rowValue: { fontSize: 16, fontWeight: '800', color: Colors.green },
  rowSub: { fontSize: 10, color: Colors.grayMid, marginTop: 2 },

  footnote: {
    ...Type.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 12,
  },
});
