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
import React, { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View, Text, Platform, TouchableOpacity } from 'react-native';
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
import Icon from '../../components/ui/Icon';
import useBreakpoint from '../../hooks/useBreakpoint';
import useEvents from '../../hooks/useEvents';
import usePickups from '../../hooks/usePickups';
import { confirm } from '../../services/ui';
import { getProfile } from '../../services/auth';
import { ensureMyPartnerRecord } from '../../services/database';
import Screen from '../../components/ui/Screen';

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const unreadCount = useNotifStore((s) => s.unreadCount);

  // Re-pull the user doc on every tab focus so lbs_rescued / hours
  // / pickups stats reflect the post-pickup bumps without forcing
  // a sign-out/sign-in.
  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    (async () => {
      // Church self-heal: if this account is flagged as a partner
      // (roles[] includes 'partner' OR primary role === 'restaurant')
      // but has no /restaurants doc yet, create it as themselves.
      // The write passes the strict user_id == auth.uid rule that
      // blocks exec-initiated backfills, so field onboarding works
      // even before the exec-friendly rules deploy lands.
      const isPartnerRole = user?.role === 'restaurant'
        || (Array.isArray(user?.roles) && user.roles.includes('partner'));
      if (isPartnerRole && !user?.restaurant_id) {
        try { await ensureMyPartnerRecord(user); } catch {}
      }
      try {
        const fresh = await getProfile(user.id);
        if (fresh && setUser) setUser({ ...user, ...fresh });
      } catch {}
    })();
  }, [user?.id]));
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

  // First-time member: zero pickups, zero events, zero hours. Show a
  // welcome banner with three clear next-steps so the empty home
  // screen reads like guidance instead of "is this even working?"
  const isNew = !user?.events_attended && !user?.meals_rescued && !user?.hours_logged;

  const welcome = isNew ? (
    <View style={styles.welcome}>
      <Text style={styles.welcomeEyebrow}>WELCOME TO BETTERNATURE</Text>
      <Text style={styles.welcomeTitle}>You’re in. Here’s what to do next.</Text>
      <View style={{ height: 14 }} />
      <WelcomeStep n="1" icon="id-card" title="Verify your ID"
        body="Required before you can claim pickups. Takes 60 seconds."
        onPress={() => navigation.navigate('VerifyId')} done={!!user?.id_document_url} />
      <WelcomeStep n="2" icon="user" title="Finish your profile"
        body="So restaurants can reach you on pickup day."
        onPress={() => navigation.navigate('EditProfile')} done={!!user?.profile_complete} />
      <WelcomeStep n="3" icon="calendar" title="Browse upcoming events"
        body="Plantings, cleanups, chapter actions."
        onPress={() => navigation.navigate('Iris')} />
    </View>
  ) : null;

  // ── Building blocks ────────────────────────────────────────────────
  const stats = (
    <View style={styles.statsRow}>
      <StatCard number={user?.events_attended || 0} label="Events" color={Colors.green} style={styles.statItem} />
      <StatCard number={user?.lbs_rescued || Math.round((user?.meals_rescued || 0) / 1.2)} label="Lbs of food rescued" color={Colors.sage} style={styles.statItem} />
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

  // Partner tools — visible when the user is a food donor as well
  // as a volunteer (churches with a community garden, dual-role
  // accounts). Uses the supplemental roles[] array so a member
  // stays in the main volunteer app AND gets the "Post surplus"
  // entry point without being forced into the restaurant-only
  // portal.
  const isPartner = user?.role === 'restaurant'
    || (Array.isArray(user?.roles) && user.roles.includes('partner'));
  const partnerTools = isPartner ? (
    <View style={styles.partnerCard}>
      <Text style={styles.partnerEyebrow}>You're also a partner</Text>
      <Text style={styles.partnerTitle}>Post food surplus</Text>
      <Text style={styles.partnerBody}>
        Have leftover food today? Post it and a volunteer will pick it up. Free, tax-deductible, weighed + receipted.
      </Text>
      <View style={styles.partnerActions}>
        <TouchableOpacity
          style={styles.partnerBtnPrimary}
          onPress={() => navigation.navigate('ScheduleDonation')}
          activeOpacity={0.85}
        >
          <Text style={styles.partnerBtnPrimaryText}>Post surplus →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.partnerBtnSecondary}
          onPress={() => navigation.navigate('DonationHistory')}
          activeOpacity={0.85}
        >
          <Text style={styles.partnerBtnSecondaryText}>My donations</Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

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
        <Screen
          contentStyle={[styles.contentDesktop, { paddingHorizontal: pad }]}
        >
          {welcome}
          {/* Stats row — drop its built-in horizontal padding here since
              contentDesktop already handles it. */}
          <View style={[styles.statsRow, styles.flushH]}>
            <StatCard number={user?.events_attended || 0} label="Events" color={Colors.green} style={styles.statItem} />
            <StatCard number={user?.lbs_rescued || Math.round((user?.meals_rescued || 0) / 1.2)} label="Lbs of food rescued" color={Colors.sage} style={styles.statItem} />
            <StatCard number={`${user?.hours_logged || 0}h`} label="Hours" color={Colors.pink} style={styles.statItem} />
          </View>

          <View style={[styles.twoCol, styles.flushH]}>
            {/* Left — primary workspace */}
            <View style={styles.colMain}>
              {partnerTools}
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
        </Screen>
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
      <Screen
        contentStyle={[
          styles.content,
          isTablet && { paddingHorizontal: 48 },
        ]}
      >
        {welcome}
        {stats}
        {partnerTools}
              {activePickups}
        <BrushDivider />
        {projects}
        <BrushDivider />
        {events_}
        <MemberOfMonth member={null} />
        <DonateCard onPress={() => navigation.navigate('Donate')} />
      </Screen>
    </View>
  );
}

function WelcomeStep({ n, icon, title, body, onPress, done }) {
  return (
    <View style={[wstyles.step, done && wstyles.stepDone]}>
      <View style={[wstyles.stepNum, done && wstyles.stepNumDone]}>
        {done
          ? <Icon name="check" size={14} color={Colors.white} strokeWidth={3} />
          : <Text style={wstyles.stepNumText}>{n}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={wstyles.stepTitle}>{title}</Text>
        <Text style={wstyles.stepBody}>{body}</Text>
      </View>
      {!done ? (
        <Text style={wstyles.stepCta} onPress={onPress}>Start →</Text>
      ) : null}
    </View>
  );
}

const wstyles = StyleSheet.create({
  step: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  stepDone: { opacity: 0.55 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumDone: { backgroundColor: Colors.green },
  stepNumText: { fontWeight: '800', color: Colors.green, fontSize: 13 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  stepBody: { fontSize: 12.5, color: '#5C6370', marginTop: 1, lineHeight: 17 },
  stepCta: { fontSize: 13, fontWeight: '700', color: Colors.pink },
});

const styles = StyleSheet.create({
  partnerCard: {
    backgroundColor: '#FFF9EC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#E0A52F',
  },
  partnerEyebrow: { fontSize: 11, fontWeight: '800', color: '#7A5400', letterSpacing: 0.6, textTransform: 'uppercase' },
  partnerTitle: { fontSize: 18, fontWeight: '800', color: Colors.dark, marginTop: 4 },
  partnerBody: { fontSize: 13, color: Colors.gray, marginTop: 6, lineHeight: 19 },
  partnerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  partnerBtnPrimary: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: Colors.green, borderRadius: 10,
  },
  partnerBtnPrimaryText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  partnerBtnSecondary: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'transparent', borderRadius: 10,
    borderWidth: 1, borderColor: Colors.green,
  },
  partnerBtnSecondaryText: { color: Colors.green, fontWeight: '800', fontSize: 14 },
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    ...(Platform.OS === 'web' ? { height: '100vh' } : null),
  },
  welcome: {
    marginHorizontal: 24,
    marginTop: 22,
    padding: 22,
    borderRadius: 18,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    shadowColor: '#1B3A2D',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  welcomeEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.5,
    color: Colors.green,
  },
  welcomeTitle: {
    fontSize: 22, fontWeight: '600',
    color: Colors.dark,
    fontFamily: Type.screenTitle?.fontFamily,
    marginTop: 6,
    letterSpacing: -0.3,
  },
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
