// LiveOps — at-a-glance view of every pickup currently in motion.
// Used on both the Executive Dashboard (org-wide) and the Chapter
// President dashboard (scoped to their chapter). Tells the leader:
//
//   • Which restaurants have food going out right now
//   • Which volunteers are out on routes
//   • Whether each is just claimed (still at base) or en route to the
//     restaurant / to the drop-off
//   • How long ago they claimed (so we can flag stuck runs)
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import { fetchActivePickups, fetchAllMembers, fetchRestaurants, fetchRecentlyCompletedPickups } from '../../services/database';

// Start of the local day in ms. LiveOps resets at midnight — every
// morning the leader sees a clean board, the prior day's runs move
// to history.
function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Lift a Firestore timestamp / ISO / Date to ms. Returns 0 if absent.
function toMs(t) {
  if (!t) return 0;
  if (t?.toDate) return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  return new Date(t).getTime();
}

function timeAgo(ts) {
  if (!ts) return '';
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusTone(p) {
  if (p.verified_by_restaurant_at) return { bg: '#E8E1F4', fg: '#5B3A8E', label: '✓ Picked up' };
  if (p.status === 'enroute') return { bg: '#FFE9CD', fg: '#B8651B', label: 'En route' };
  return { bg: '#E5EEF7', fg: '#2E5984', label: 'Claimed' };
}

export default function LiveOps({ chapterId = null, navigation }) {
  const [pickups, setPickups] = useState([]);
  const [recent, setRecent] = useState([]);
  const [members, setMembers] = useState({});
  const [restaurants, setRestaurants] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = startOfTodayMs();
      const [pk, done, mem, rest] = await Promise.all([
        fetchActivePickups({ chapterId }),
        fetchRecentlyCompletedPickups({ chapterId, hours: 24 }),
        fetchAllMembers(),
        fetchRestaurants(),
      ]);
      // LiveOps shows ONLY today. A run claimed yesterday that's
      // still sitting "claimed" doesn't bleed into the new day's
      // board, and yesterday's deliveries vanish at midnight.
      const inflightToday = pk.filter((p) =>
        toMs(p.claimed_at || p.created_at) >= today
      );
      const deliveredToday = done.filter((p) =>
        toMs(p.completed_at) >= today
      );
      setPickups(inflightToday);
      setRecent(deliveredToday);
      setMembers(Object.fromEntries(mem.map((m) => [m.id, m])));
      setRestaurants(Object.fromEntries(rest.map((r) => [r.id, r])));
    } catch (e) {
      console.warn('LiveOps load failed', e);
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useEffect(() => { load(); }, [load]);

  // Unique volunteers currently out so the leader sees a roster too.
  const volunteersOut = Array.from(new Set(
    pickups.map((p) => p.claimed_by).filter(Boolean)
  )).map((id) => members[id]).filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Live operations</Text>
          <Text style={styles.subhead}>Today only · resets at midnight</Text>
        </View>
        <TouchableOpacity onPress={load} style={styles.refresh}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{pickups.length}</Text>
          <Text style={styles.statLabel}>Pickups in flight</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{volunteersOut.length}</Text>
          <Text style={styles.statLabel}>Volunteers out</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{pickups.filter((p) => p.status === 'enroute').length}</Text>
          <Text style={styles.statLabel}>En route now</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.green} style={{ marginVertical: 16 }} />
      ) : pickups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active runs right now.</Text>
        </View>
      ) : (
        pickups.map((p) => {
          const vol = members[p.claimed_by];
          const rest = restaurants[p.restaurant_id];
          const tone = statusTone(p);
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={navigation ? 0.8 : 1}
              onPress={navigation ? () => navigation.navigate('PickupDetail', { id: p.id }) : undefined}
              style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {rest?.name || p.restaurant_name || 'Restaurant'}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {vol?.name || vol?.full_name || 'Volunteer'}
                  {vol?.phone ? ` · ${vol.phone}` : ''}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  Claimed {timeAgo(p.claimed_at || p.updated_at || p.created_at)}
                  {(p.actual_weight_lbs || p.estimated_weight_lbs) ? ` · ~${p.actual_weight_lbs || p.estimated_weight_lbs} lbs` : ''}
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: tone.bg }]}>
                <Text style={[styles.tagText, { color: tone.fg }]}>{tone.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {recent.length > 0 && (
        <>
          <Text style={[styles.heading, { marginTop: 14, fontSize: 16 }]}>
            Delivered today
          </Text>
          {recent.map((p) => {
            const vol = members[p.claimed_by];
            const rest = restaurants[p.restaurant_id];
            const ts = p.completed_at?.toDate ? p.completed_at.toDate() : p.completed_at;
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={navigation ? 0.8 : 1}
                onPress={navigation ? () => navigation.navigate('PickupDetail', { id: p.id }) : undefined}
                style={[styles.card, { borderLeftColor: Colors.green }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {rest?.name || p.restaurant_name || 'Restaurant'}
                    {(p.actual_weight_lbs || p.estimated_weight_lbs) ? `  ·  ${p.actual_weight_lbs || p.estimated_weight_lbs} lbs` : ''}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    Dropped by {vol?.name || vol?.full_name || 'volunteer'} · {timeAgo(ts)}
                  </Text>
                </View>
                <View style={[styles.tag, { backgroundColor: '#DFF1E2' }]}>
                  <Text style={[styles.tagText, { color: '#2E7D32' }]}>✓ Delivered</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  heading: { ...Type.h3, color: Colors.dark },
  subhead: { ...Type.caption, color: Colors.grayMid, marginTop: 2 },
  refresh: { paddingHorizontal: 10, paddingVertical: 4 },
  refreshText: { color: Colors.green, fontWeight: '600', fontSize: 13 },

  // 3-col grid that stays a grid on tablet/desktop but wraps to
  // 2-col on tiny screens (rarely needed, but cheap to add).
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1,
    minWidth: 90,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    ...Shadows.soft,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.green },
  statLabel: { ...Type.caption, marginTop: 2, textAlign: 'center', fontSize: 11 },

  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 18,
    alignItems: 'center',
    ...Shadows.soft,
  },
  emptyText: { ...Type.body, color: Colors.gray },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: Colors.pink,
    ...Shadows.soft,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  cardSub: { ...Type.caption, marginTop: 2 },
  cardMeta: { fontSize: 11, color: Colors.grayMid, marginTop: 2 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagText: { fontSize: 11, fontWeight: '700' },
});
