import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import {
  fetchEvents,
  fetchPickups,
  fetchAllDonations,
  fetchAnnouncements,
} from '../../services/database';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GlobalHistory({ navigation }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const [events, pickups, donations, announcements] = await Promise.all([
          fetchEvents(),
          fetchPickups(),
          fetchAllDonations(),
          fetchAnnouncements('all'),
        ]);

        const merged = [
          ...events.map((e) => ({
            id: `ev-${e.id}`,
            type: 'event',
            title: e.title,
            subtitle: `${e.location} · ${e.filled_spots ?? 0}/${e.spots ?? 0} spots`,
            date: e.date,
            emoji: '📅',
            color: Colors.sage,
          })),
          ...pickups.map((p) => ({
            id: `pk-${p.id}`,
            type: 'pickup',
            title: `${p.restaurant_name} pickup`,
            subtitle: `${p.estimated_weight_lbs} lbs · ${p.scheduled_time}`,
            date: p.scheduled_date,
            emoji: '🍽️',
            color: Colors.green,
          })),
          ...donations.map((d) => ({
            id: `do-${d.id}`,
            type: 'donation',
            title: `${d.donor_name || 'Anonymous'} donated $${d.amount}`,
            subtitle: d.recurring ? 'Monthly donor' : d.source?.replace(/_/g, ' ') || 'One-time',
            date: d.created_at,
            emoji: '💵',
            color: Colors.pink,
          })),
          ...announcements.map((a) => ({
            id: `an-${a.id}`,
            type: 'announcement',
            title: a.title,
            subtitle: a.body,
            date: a.created_at,
            emoji: '📢',
            color: Colors.skyDark,
          })),
        ];

        merged.sort((a, b) => new Date(b.date) - new Date(a.date));
        setItems(merged);
      } catch (e) {}
    }
    load();
  }, []);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'event', label: 'Events' },
    { key: 'pickup', label: 'Pickups' },
    { key: 'donation', label: 'Donations' },
    { key: 'announcement', label: 'Broadcasts' },
  ];

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.type === filter)),
    [items, filter]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Global History
      </BrushText>
      <Text style={styles.subtitle}>All activity across BetterNature</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, filter === f.key && styles.tabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyText}>No activity yet</Text>
        </View>
      ) : (
        filtered.map((item) => (
          <View
            key={item.id}
            style={[styles.itemRow, { borderLeftColor: item.color }]}
          >
            <Text style={styles.itemEmoji}>{item.emoji}</Text>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle} numberOfLines={2}>
                {item.subtitle}
              </Text>
            </View>
            <Text style={styles.itemDate}>{fmtDate(item.date)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 16 },
  tabsRow: { gap: 8, paddingBottom: 16 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.grayLight,
  },
  tabActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.gray },
  tabTextActive: { color: '#fff' },
  empty: { padding: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { ...Type.caption },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 8,
    ...Shadows.card,
  },
  itemEmoji: { fontSize: 22, marginRight: 12 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  itemSubtitle: { ...Type.caption, marginTop: 2 },
  itemDate: { fontSize: 12, fontWeight: '600', color: Colors.gray, marginLeft: 10 },
});
