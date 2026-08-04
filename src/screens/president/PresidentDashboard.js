// Chapter president home — direction v1.
//
// Same design language as the member + restaurant dashboards. President
// state is less obviously "one thing at a time" than the member's — they
// juggle a chapter — so the hero is a pulse card instead of a single
// action. It answers "how's my chapter doing right now?" at a glance,
// with a supporting "needs your attention this week" list surfacing the
// exec-approvals-side patterns (pending join requests, events without
// RSVPs, unclaimed pickups sitting too long).
//
// LiveOps stays embedded — it's the operational hub during a run.
// Tools grid is compact and secondary.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import useAuthStore from '../../store/authStore';
import { fetchEvents, fetchPickups, fetchChapterById, fetchRecentlyCompletedPickups } from '../../services/database';
import { signOut } from '../../services/auth';
import Icon from '../../components/ui/Icon';
import { confirm } from '../../services/ui';
import ContractGate from '../../components/ui/ContractGate';
import Screen from '../../components/ui/Screen';
import LiveOps from '../admin/LiveOps';
import { mealsFromLbs, familyDaysFromLbs } from '../../services/impact';
import WorkspaceChip from '../../components/ui/WorkspaceChip';

const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

const TOOLS = [
  { key: 'events',    icon: 'calendar',  title: 'Events',            to: 'PresEvents' },
  { key: 'members',   icon: 'users',     title: 'Members',           to: 'PresMembers' },
  { key: 'checklist', icon: 'check',     title: 'Chapter checklist', to: 'ChapterChecklist' },
  { key: 'broadcast', icon: 'bell',      title: 'Announcement',      to: 'PresBroadcast' },
  { key: 'reports',   icon: 'clipboard', title: 'Reports',           to: 'PresReports' },
  { key: 'metrics',   icon: 'star',      title: 'Edit metrics',      to: 'PresMetrics' },
  { key: 'finance',   icon: 'gift',      title: 'Chapter finance',   to: 'PresFinance' },
];

function firstName(user) { return (user?.name || 'President').split(' ')[0]; }
function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Hi';
  if (h < 22) return 'Good evening,';
  return 'Hey';
}

export default function PresidentDashboard({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const { contentStyle, toolTileMinWidth } = useResponsiveLayout();
  const [chapter, setChapter] = useState(null);
  const [events, setEvents] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [completedWeek, setCompletedWeek] = useState([]);

  useEffect(() => {
    async function load() {
      const chId = user?.chapter_id;
      if (!chId) return;
      try {
        const [ch, ev, pk, done] = await Promise.all([
          fetchChapterById(chId),
          fetchEvents(chId),
          fetchPickups(chId),
          fetchRecentlyCompletedPickups({ chapterId: chId, hours: 24 * 7 }),
        ]);
        setChapter(ch);
        setEvents(ev || []);
        setPickups(pk || []);
        setCompletedWeek(done || []);
      } catch {}
    }
    load();
  }, [user?.chapter_id]);

  async function handleSignOut() {
    const ok = await confirm('Sign Out', 'Sign out of the president portal?');
    if (!ok) return;
    try { await signOut(); } catch {}
    clearAuth();
  }

  const chapterName = chapter?.name || 'Your chapter';
  const memberCount = chapter?.member_count || 0;
  const weekLbs = completedWeek.reduce((s, p) => s + (p.actual_weight_lbs || p.estimated_weight_lbs || 0), 0);
  const weekLbsRounded = Math.round(weekLbs);
  const unclaimedCount = pickups.filter((p) => p.status === 'available').length;
  const now = new Date();
  const upcoming = (events || [])
    .filter((e) => {
      const d = new Date(`${e.date}T${e.time || '00:00'}`);
      return d > now;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 2);

  return (
    <ContractGate kind="president">
    <Screen contentStyle={contentStyle}>
      <ResponsiveContainer maxWidth={720}>
        <WorkspaceChip
          user={user}
          workspaceName={chapterName}
          scope="chapter"
        />
        <IdentityStrip
          eyebrow={`President · ${chapterName}`}
          greeting={timeOfDayGreeting()}
          name={firstName(user)}
          avatarInitial={(user?.name || '?')[0].toUpperCase()}
          onSignOut={handleSignOut}
        />

        <PulseHero
          chapterName={chapterName}
          weekLbs={weekLbsRounded}
          weekRuns={completedWeek.length}
          memberCount={memberCount}
        />

        <NeedsAttention
          unclaimedCount={unclaimedCount}
          upcomingEvents={upcoming}
          onEventPress={(event) => navigation.navigate('EventDetail', { event })}
          onOpenPickups={() => navigation.navigate('Home')}
        />

        <LiveOps chapterId={user?.chapter_id} navigation={navigation} />

        <ToolsRow navigation={navigation} tileMinWidth={toolTileMinWidth} />
      </ResponsiveContainer>
    </Screen>
    </ContractGate>
  );
}

function IdentityStrip({ eyebrow, greeting, name, avatarInitial, onSignOut }) {
  return (
    <View style={styles.idStrip}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{avatarInitial}</Text></View>
      <View style={styles.greeting}>
        <Text style={styles.greetingK} numberOfLines={1}>{eyebrow}</Text>
        <Text style={styles.greetingT} numberOfLines={1}>{greeting} {name}</Text>
      </View>
      <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutTxt}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

// Pulse hero — forest ground, warm serif for the pounds number. Reads
// "your chapter did X this week" at a glance without needing to open
// reports.
function PulseHero({ chapterName, weekLbs, weekRuns, memberCount }) {
  const hasActivity = weekLbs > 0 || weekRuns > 0;
  const meals = mealsFromLbs(weekLbs);
  return (
    <View style={styles.pulseHero}>
      <Text style={styles.pulseEyebrow}>This week · {chapterName}</Text>
      {hasActivity ? (
        <>
          <Text style={styles.pulseNum}>
            {weekLbs.toLocaleString('en-US')}
            <Text style={styles.pulseNumUnit}> lbs rescued</Text>
          </Text>
          <Text style={styles.pulseBody}>
            <Text style={styles.pulseBodyEm}>{weekRuns} run{weekRuns === 1 ? '' : 's'}</Text>
            {meals > 0 ? ` · about ${meals.toLocaleString('en-US')} meals` : ''}
            {memberCount > 0 ? ` · ${memberCount} member${memberCount === 1 ? '' : 's'} strong` : ''}
            .
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.pulseNum}>A quiet week so far.</Text>
          <Text style={styles.pulseBody}>
            {memberCount > 0
              ? `${memberCount} member${memberCount === 1 ? '' : 's'} on the roster. `
              : ''}
            Send an announcement or post an event to get the week moving.
          </Text>
        </>
      )}
    </View>
  );
}

// Needs-your-attention list — the president's inbox distilled to
// today's next moves. Renders only rows that actually have signal.
function NeedsAttention({ unclaimedCount, upcomingEvents, onEventPress, onOpenPickups }) {
  const items = [];
  if (unclaimedCount > 0) {
    items.push({
      key: 'unclaimed',
      icon: 'clipboard',
      title: `${unclaimedCount} pickup${unclaimedCount === 1 ? '' : 's'} waiting for a volunteer`,
      body: 'Nudge your chapter or post an announcement so they don\'t expire.',
      onPress: onOpenPickups,
    });
  }
  for (const e of upcomingEvents) {
    items.push({
      key: `event-${e.id}`,
      icon: 'calendar',
      title: e.title || 'Upcoming event',
      body: `${e.date}${e.time ? ` · ${e.time}` : ''}${e.location ? ` · ${e.location}` : ''}`,
      onPress: () => onEventPress(e),
    });
  }
  if (items.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>What's next</Text>
        <Text style={styles.cardTitle}>You're all caught up.</Text>
        <Text style={styles.cardMeta}>No pickups sitting unclaimed and no events on the calendar right now.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>What's next</Text>
      <View style={{ marginTop: 6 }}>
        {items.map((it, i) => (
          <TouchableOpacity
            key={it.key}
            style={[styles.attnRow, i > 0 && styles.attnRowBorder]}
            onPress={it.onPress}
            activeOpacity={0.85}
          >
            <View style={styles.attnIcon}>
              <Icon name={it.icon} size={16} color={Colors.green} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.attnTitle} numberOfLines={1}>{it.title}</Text>
              <Text style={styles.attnBody} numberOfLines={2}>{it.body}</Text>
            </View>
            <Icon name="chevron" size={16} color={Colors.grayMid} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ToolsRow({ navigation, tileMinWidth }) {
  return (
    <View style={styles.toolsCard}>
      <Text style={styles.cardEyebrow}>Manage chapter</Text>
      <View style={styles.toolsGrid}>
        {TOOLS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.toolItem, tileMinWidth ? { minWidth: tileMinWidth } : null]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(t.to)}
          >
            <View style={styles.toolIcon}>
              <Icon name={t.icon} size={16} color={Colors.green} strokeWidth={2} />
            </View>
            <Text style={styles.toolLabel}>{t.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  idStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.cream, fontFamily: SERIF, fontSize: 16, fontWeight: '500' },
  greeting: { flex: 1, minWidth: 0 },
  greetingK: { fontSize: 11, color: Colors.gray, letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: '700' },
  greetingT: { fontSize: 16, fontWeight: '600', color: Colors.dark, marginTop: 1 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutTxt: { fontSize: 13, color: Colors.pink, fontWeight: '600' },

  pulseHero: {
    backgroundColor: Colors.green,
    borderRadius: 22,
    padding: 22,
    marginTop: 6,
    gap: 8,
  },
  pulseEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
  },
  pulseNum: {
    fontFamily: SERIF, fontSize: 40, lineHeight: 42,
    color: Colors.cream, fontWeight: '500', letterSpacing: -0.6, marginTop: 4,
  },
  pulseNumUnit: {
    fontFamily: undefined,
    fontSize: 14, fontWeight: '500', letterSpacing: 0,
    color: 'rgba(255,255,255,0.7)',
  },
  pulseBody: {
    fontSize: 14.5, lineHeight: 21,
    color: 'rgba(255,255,255,0.85)', marginTop: 4,
  },
  pulseBodyEm: { color: Colors.cream, fontWeight: '700' },

  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  cardEyebrow: {
    fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4,
    textTransform: 'uppercase', color: Colors.gray, marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.dark, lineHeight: 20 },
  cardMeta: { fontSize: 12.5, color: Colors.gray, marginTop: 4 },

  attnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  attnRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.glassBorder },
  attnIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  attnTitle: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  attnBody: { fontSize: 12.5, color: Colors.gray, marginTop: 2 },

  toolsCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  toolsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8,
  },
  toolItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.glassBorder,
    minWidth: '47%',
  },
  toolIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  toolLabel: { fontSize: 13.5, fontWeight: '600', color: Colors.dark, flex: 1 },
});
