// Home / Dashboard.
//
// Mobile: a single column scroll — stats, active pickups, projects, events,
// member-of-the-month, donate card.
//
// Desktop / laptop: the same building blocks rearranged into a real
// two-column workspace that fills the viewport. The right rail (1/3 of
// the width) holds Events + Donate + Member-of-the-month so the eye
// always lands on "what to do next" without scrolling. Left column
// (2/3) is the user's actual work: stats, active pickups, programs.
//
// We don't cap maxWidth on desktop because the explicit ask was: use the
// whole laptop screen. Padding scales with breakpoint instead of layout
// width so the content breathes without feeling like a stretched phone.
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Colors, Type } from '../../config/theme';
import useAuthStore from '../../store/authStore';
import useNotifStore from '../../store/notifStore';
import DashboardHeader from '../../components/sections/DashboardHeader';
import ProjectCards from '../../components/sections/ProjectCards';
import UpcomingEvents from '../../components/sections/UpcomingEvents';
import DonateCard from '../../components/sections/DonateCard';
import MemberOfMonth from '../../components/sections/MemberOfMonth';
import MyPickups from '../../components/sections/MyPickups';
import BrushDivider from '../../components/ui/BrushDivider';
import StatCard from '../../components/ui/StatCard';
import useBreakpoint from '../../hooks/useBreakpoint';
import useEvents from '../../hooks/useEvents';
import usePickups from '../../hooks/usePickups';
import { confirm } from '../../services/ui';

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotifStore((s) => s.unreadCount);
  const { events } = useEvents();
  const { pickups, claim } = usePickups();
  const { isDesktop, isTablet, width } = useBreakpoint();

  async function handleClaimPickup(pickup) {
    const ok = await confirm(
      'Claim Pickup',
      `Claim the pickup from ${pickup.restaurant_name}?`
    );
    if (!ok) return;
    try { await claim(pickup.id); } catch {}
  }

  // ── Building blocks ────────────────────────────────────────────────
  const stats = (
    <View style={styles.statsRow}>
      <StatCard number={user?.events_attended || 0} label="Events" color={Colors.green} style={styles.statItem} />
      <StatCard number={user?.meals_rescued || 0} label="Meals Rescued" color={Colors.sage} style={styles.statItem} />
      <StatCard number={`${user?.hours_logged || 0}h`} label="Hours" color={Colors.pink} style={styles.statItem} />
    </View>
  );

  const activePickups = (
    <MyPickups
      pickups={pickups}
      userId={user?.id}
      onPickupPress={(p) => navigation.navigate('PickupDetail', { pickupId: p.id, pickup: p })}
      onClaimPress={handleClaimPickup}
    />
  );

  const projects = (
    <ProjectCards onPress={(project) => navigation.navigate('ProjectDetail', { project })} />
  );

  const events_ = (
    <UpcomingEvents
      events={events}
      onEventPress={(event) => navigation.navigate('EventDetail', { event })}
    />
  );

  // ── Desktop layout: hero strip + two-column workspace ──────────────
  if (isDesktop) {
    // Generous horizontal padding scales with the viewport so the
    // content reads at the same rhythm whether the laptop is 13" or 27".
    const pad = Math.max(32, Math.min(96, Math.round((width - 1280) * 0.25 + 32)));
    return (
      <View style={styles.container}>
        <DashboardHeader
          user={user}
          chapterName={user?.chapter?.name}
          unreadCount={unreadCount}
          onNotifPress={() => navigation.navigate('Notifications')}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.contentDesktop, { paddingHorizontal: pad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats row — drop its built-in horizontal padding here since
              contentDesktop already handles it. */}
          <View style={[styles.statsRow, styles.flushH]}>
            <StatCard number={user?.events_attended || 0} label="Events" color={Colors.green} style={styles.statItem} />
            <StatCard number={user?.meals_rescued || 0} label="Meals Rescued" color={Colors.sage} style={styles.statItem} />
            <StatCard number={`${user?.hours_logged || 0}h`} label="Hours" color={Colors.pink} style={styles.statItem} />
          </View>

          <View style={[styles.twoCol, styles.flushH]}>
            {/* Left — primary workspace */}
            <View style={styles.colMain}>
              {activePickups}
              <View style={{ height: 28 }} />
              {projects}
            </View>

            {/* Right — what's next */}
            <View style={styles.colSide}>
              {events_}
              <View style={{ height: 20 }} />
              <DonateCard onPress={() => navigation.navigate('Donate')} />
              <View style={{ height: 20 }} />
              <MemberOfMonth member={null} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Phone + tablet: single column, padding bumps a notch on tablet ─
  return (
    <View style={styles.container}>
      <DashboardHeader
        user={user}
        chapterName={user?.chapter?.name}
        unreadCount={unreadCount}
        onNotifPress={() => navigation.navigate('Notifications')}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isTablet && { paddingHorizontal: 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {stats}
        {activePickups}
        <BrushDivider />
        {projects}
        <BrushDivider />
        {events_}
        <MemberOfMonth member={null} />
        <DonateCard onPress={() => navigation.navigate('Donate')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  contentDesktop: {
    paddingTop: 24,
    paddingBottom: 60,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 22,
    gap: 14,
  },
  statItem: { flex: 1 },

  // Desktop columns: 2:1 split. flex values, not fixed widths, so the
  // layout still adapts to ultra-wide and laptop screens alike.
  twoCol: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 32,
    gap: 32,
    alignItems: 'flex-start',
  },
  colMain: { flex: 2, minWidth: 0 },
  colSide: { flex: 1, minWidth: 280 },
  // Strips the default horizontal padding on rows so the parent
  // contentDesktop's responsive padding is the only horizontal source.
  flushH: { paddingHorizontal: 0 },
});
