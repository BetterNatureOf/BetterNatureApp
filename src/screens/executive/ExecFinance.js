import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import { fetchAllDonations } from '../../services/database';
import Screen from '../../components/ui/Screen';

function fmtMoney(n) {
  return `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ExecFinance({ navigation }) {
  const [donations, setDonations] = useState([]);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    fetchAllDonations()
      .then(setDonations)
      .catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const total = donations.reduce((s, d) => s + (d.amount || 0), 0);
    const recurring = donations.filter((d) => d.recurring);
    const recurringTotal = recurring.reduce((s, d) => s + (d.amount || 0), 0);
    const sponsorships = donations.filter((d) => d.source === 'restaurant_sponsorship');
    return {
      total,
      donorCount: new Set(donations.map((d) => d.user_id)).size,
      recurringCount: recurring.length,
      recurringTotal,
      sponsorshipTotal: sponsorships.reduce((s, d) => s + (d.amount || 0), 0),
    };
  }, [donations]);

  const filtered = useMemo(() => {
    if (tab === 'recurring') return donations.filter((d) => d.recurring);
    if (tab === 'sponsorships') return donations.filter((d) => d.source === 'restaurant_sponsorship');
    return donations;
  }, [donations, tab]);

  return (
    <Screen contentStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <BrushText variant="screenTitle" style={styles.title}>
        Donations & Finance
      </BrushText>
      <Text style={styles.subtitle}>Apple Pay activity across the org</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Raised this period</Text>
        <Text style={styles.heroValue}>{fmtMoney(stats.total)}</Text>
        <Text style={styles.heroCaption}>
          from {stats.donorCount} donor{stats.donorCount === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Recurring</Text>
          <Text style={styles.kpiValue}>{fmtMoney(stats.recurringTotal)}/mo</Text>
          <Text style={styles.kpiCaption}>{stats.recurringCount} subscribers</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Sponsorships</Text>
          <Text style={styles.kpiValue}>{fmtMoney(stats.sponsorshipTotal)}</Text>
          <Text style={styles.kpiCaption}>from restaurants</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {[
          { key: 'all', label: 'All' },
          { key: 'recurring', label: 'Recurring' },
          { key: 'sponsorships', label: 'Sponsorships' },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>💵</Text>
          <Text style={styles.emptyText}>No donations yet</Text>
        </View>
      ) : (
        filtered.map((d) => (
          <View key={d.id} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.donor}>{d.donor_name || 'Anonymous'}</Text>
              <Text style={styles.rowMeta}>
                {fmtDate(d.created_at)} ·{' '}
                {d.source === 'restaurant_sponsorship'
                  ? 'Restaurant sponsorship'
                  : d.recurring
                  ? 'Monthly donor'
                  : 'One-time'}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.amount}>{fmtMoney(d.amount)}</Text>
              {d.recurring ? <Text style={styles.amountSub}>/ month</Text> : null}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  back: { fontSize: 16, color: Colors.green, marginBottom: 8 },
  title: { color: Colors.green },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 4, marginBottom: 20 },
  heroCard: {
    backgroundColor: '#000',
    borderRadius: Radius.lg,
    padding: 24,
    marginBottom: 12,
    ...Shadows.card,
  },
  heroLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroValue: { color: '#fff', fontSize: 44, fontFamily: 'Caveat-Bold', marginTop: 6 },
  heroCaption: { color: '#D1D5DB', fontSize: 13, marginTop: 4 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpi: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    ...Shadows.card,
  },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray, textTransform: 'uppercase', letterSpacing: 0.8 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: Colors.dark, marginTop: 6 },
  kpiCaption: { ...Type.caption, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 8,
    ...Shadows.card,
  },
  rowLeft: { flex: 1 },
  donor: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  rowMeta: { ...Type.caption, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.green },
  amountSub: { fontSize: 11, color: Colors.gray, marginTop: 1 },
});
