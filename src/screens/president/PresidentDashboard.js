import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import BrushText from '../../components/ui/BrushText';
import StatCard from '../../components/ui/StatCard';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import { fetchEvents, fetchPickups, fetchChapterById } from '../../services/database';
import { signOut } from '../../services/auth';

const ACTIONS = [
  { key: 'events', label: 'Manage Events', emoji: '\u{1F4C5}', desc: 'Create and edit chapter events', screen: 'PresEvents', color: Colors.green },
  { key: 'members', label: 'Chapter Members', emoji: '\u{1F465}', desc: 'View and manage your members', screen: 'PresMembers', color: Colors.sage },
  { key: 'checklist', label: 'Chapter Checklist', emoji: '\u2705', desc: 'Track your chapter setup progress', screen: 'ChapterChecklist', color: Colors.sky },
  { key: 'broadcast', label: 'Send Announcement', emoji: '\u{1F4E2}', desc: 'Notify your chapter members', screen: 'PresBroadcast', color: Colors.pink },
  { key: 'reports', label: 'Chapter Reports', emoji: '\u{1F4CA}', desc: 'Hours, meals, donations this month', screen: 'PresReports', color: Colors.amber },
  { key: 'metrics', label: 'Edit Metrics', emoji: '\u{1F4C8}', desc: 'Adjust auto-tracked totals or add manual ones', screen: 'PresMetrics', color: Colors.green },
];

export default function PresidentDashboard({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const { isWide, isDesktop } = useBreakpoint();
  const [chapter, setChapter] = useState(null);
  const [events, setEvents] = useState([]);
  const [pickups, setPickups] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const ch = await fetchChapterById(user?.chapter_id);
        setChapter(ch);
        const ev = await fetchEvents(user?.chapter_id);
        setEvents(ev);
        const pk = await fetchPickups(user?.chapter_id);
        setPickups(pk);
      } catch (e) {}
    }
    load();
  }, []);

  function handleSignOut() {
    Alert.alert('Sign Out', 'Sign out of the president portal?', [
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
      <ResponsiveContainer maxWidth={1100}>
        {/* Header */}
        <LinearGradient
          colors={Colors.gradient.green}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>President {'\u00B7'} {chapter?.name || 'Your Chapter'}</Text>
              <BrushText variant="screenTitle" style={styles.title}>
                Welcome, {user?.name?.split(' ')[0] || 'President'}!
              </BrushText>
            </View>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
              <Text style={styles.signOut}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard number={String(chapter?.member_count || 0)} label="Members" color={Colors.sage} style={styles.stat} />
          <StatCard number={String(events.length)} label="Events" color={Colors.green} style={styles.stat} />
          <StatCard number={String(pickups.length)} label="Pickups" color={Colors.pink} style={styles.stat} />
        </View>

        {/* Tools */}
        <BrushText variant="sectionHeader" style={styles.sectionHeader}>
          Chapter Tools
        </BrushText>

        <View style={[styles.grid, isWide && styles.gridWide]}>
          {ACTIONS.map((item) => (
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
  headerCard: {
    borderRadius: Radius.xl,
    padding: 24,
    marginBottom: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eyebrow: { ...Type.eyebrow, color: 'rgba(255,255,255,0.55)', fontSize: 10 },
  title: { color: Colors.white, marginTop: 4 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOut: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  stat: { flex: 1 },
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
  cardDesktop: { flexBasis: '31%' },
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
