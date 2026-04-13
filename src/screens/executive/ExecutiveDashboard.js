import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import { fetchChapters, fetchAllMembers, fetchRestaurants, fetchAllDonations, fetchOrgMetrics } from '../../services/database';
import { signOut } from '../../services/auth';

const TOOLS = [
  { key: 'chapters', label: 'Manage Chapters', emoji: '\u{1F4CD}', desc: 'Approve, edit, or close chapters', screen: 'ManageChapters', color: Colors.sage },
  { key: 'members', label: 'Manage Members', emoji: '\u{1F465}', desc: 'Promote presidents, edit roles', screen: 'ManageMembers', color: Colors.green },
  { key: 'restaurants', label: 'Manage Restaurants', emoji: '\u{1F37D}', desc: 'Approve restaurant partner applications', screen: 'ManageRestaurants', color: Colors.amber },
  { key: 'broadcast', label: 'Org-wide Broadcast', emoji: '\u{1F4E2}', desc: 'Send a message to every chapter', screen: 'Broadcast', color: Colors.pink },
  { key: 'history', label: 'Global History', emoji: '\u{1F30D}', desc: 'All events, pickups, donations', screen: 'GlobalHistory', color: Colors.sky },
  { key: 'reports', label: 'Export Reports', emoji: '\u{1F4C4}', desc: 'PDF / CSV financial and impact reports', screen: 'ExportReports', color: Colors.grayMid },
  { key: 'finance', label: 'Donations & Finance', emoji: '\u{1F4B5}', desc: 'Track Apple Pay and recurring donors', screen: 'ExecFinance', color: Colors.green },
  { key: 'metrics', label: 'Impact Metrics', emoji: '\u{1F4C8}', desc: 'Edit org-wide impact numbers', screen: 'ExecMetrics', color: Colors.sage },
  { key: 'settings', label: 'Org Settings', emoji: '\u2699\uFE0F', desc: 'Brand, contact, legal, integrations', screen: 'Settings', color: Colors.grayMid },
];

function fmtMoney(n) {
  return `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function ExecutiveDashboard({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const { isWide, isDesktop } = useBreakpoint();
  const [stats, setStats] = useState({ chapters: 0, members: 0, restaurants: 0 });
  const [finance, setFinance] = useState({ raised: 0, mealsRescued: 0 });

  useEffect(() => {
    async function load() {
      try {
        const [chapters, members, restaurants, donations, metrics] =
          await Promise.all([
            fetchChapters(),
            fetchAllMembers(),
            fetchRestaurants(),
            fetchAllDonations(),
            fetchOrgMetrics({ scope: 'org' }),
          ]);
        setStats({
          chapters: chapters.length,
          members: members.length,
          restaurants: restaurants.length,
        });
        const meals = metrics.find((m) => m.key === 'meals_rescued_org');
        setFinance({
          raised: donations.reduce((s, d) => s + (d.amount || 0), 0),
          mealsRescued: meals?.value || 0,
        });
      } catch (e) {}
    }
    load();
  }, []);

  function handleSignOut() {
    Alert.alert('Sign Out', 'Sign out of the executive portal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clearAuth();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ResponsiveContainer maxWidth={1200}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Executive {'\u00B7'} C-Suite</Text>
            <BrushText variant="screenTitle" style={styles.title}>
              Hi {user?.name?.split(' ')[0] || 'Exec'},
            </BrushText>
            <Text style={styles.subtitle}>Here's the org at a glance.</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard number={String(stats.chapters)} label="Chapters" color={Colors.sage} style={styles.stat} />
          <StatCard number={String(stats.members)} label="Members" color={Colors.green} style={styles.stat} />
          <StatCard number={String(stats.restaurants)} label="Partners" color={Colors.pink} style={styles.stat} />
        </View>

        {/* KPI Cards */}
        <View style={[styles.kpis, isWide && styles.kpisWide]}>
          <LinearGradient
            colors={Colors.gradient.green}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.kpi}
          >
            <Text style={styles.kpiLabel}>This month</Text>
            <Text style={styles.kpiValue}>{fmtMoney(finance.raised)}</Text>
            <Text style={styles.kpiCaption}>raised across chapters</Text>
          </LinearGradient>
          <LinearGradient
            colors={Colors.gradient.sage}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.kpi}
          >
            <Text style={styles.kpiLabel}>Meals rescued</Text>
            <Text style={styles.kpiValue}>{finance.mealsRescued.toLocaleString()}</Text>
            <Text style={styles.kpiCaption}>in the last 30 days</Text>
          </LinearGradient>
        </View>

        {/* Tools */}
        <BrushText variant="sectionHeader" style={styles.sectionHeader}>
          Executive Tools
        </BrushText>

        <View style={[styles.grid, isWide && styles.gridWide]}>
          {TOOLS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.card,
                isWide && styles.cardWide,
                isDesktop && styles.cardDesktop,
              ]}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={[styles.emojiWrap, { backgroundColor: item.color + '15' }]}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </View>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.desc}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { ...Type.eyebrow, color: Colors.pink, fontSize: 11 },
  title: { color: Colors.green, marginTop: 4 },
  subtitle: { ...Type.body, color: Colors.gray, marginTop: 2 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOut: { fontSize: 13, color: Colors.pink, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stat: { flex: 1 },

  kpis: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  kpisWide: { gap: 16 },
  kpi: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: 22,
  },
  kpiLabel: { ...Type.eyebrow, color: 'rgba(255,255,255,0.55)', fontSize: 10 },
  kpiValue: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 6, fontFamily: 'Caveat-Bold' },
  kpiCaption: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4, fontWeight: '500' },

  sectionHeader: { color: Colors.green, marginBottom: 14 },
  grid: { flexDirection: 'column', gap: 12 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.card,
  },
  cardWide: { flexBasis: '47%', flexGrow: 1, minWidth: 240 },
  cardDesktop: { flexBasis: '23%' },
  emojiWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emoji: { fontSize: 24 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.dark, letterSpacing: -0.2 },
  desc: { ...Type.caption, marginTop: 4 },
});
