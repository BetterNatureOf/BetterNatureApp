// Executive home — direction v1.
//
// Same design language as the other three. Exec sees the whole org, so
// the hero is an org-wide pulse card and the supporting content leans
// on what an exec is uniquely a bottleneck for: pending approvals.
//
// Order:
//   - IdentityStrip
//   - PulseHero (org-wide activity this week: lbs, runs, chapters active)
//   - PendingApprovals card (chapter apps, restaurant apps, join requests)
//   - KPI trio (this month's dollars raised + all-time lbs — quiet)
//   - LiveOps (org-wide)
//   - Tools grid (compact, secondary)
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../config/firebase';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import useBreakpoint from '../../hooks/useBreakpoint';
import useAuthStore from '../../store/authStore';
import {
  fetchChapters, fetchAllMembers, fetchRestaurants, fetchAllDonations,
  fetchOrgMetrics, fetchRecentlyCompletedPickups,
} from '../../services/database';
import { signOut } from '../../services/auth';
import { confirm } from '../../services/ui';
import ContractGate from '../../components/ui/ContractGate';
import Screen from '../../components/ui/Screen';
import LiveOps from '../admin/LiveOps';
import Icon from '../../components/ui/Icon';
import { mealsFromLbs } from '../../services/impact';
import WorkspaceChip from '../../components/ui/WorkspaceChip';

const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

const TOOLS = [
  { key: 'chapters',    icon: 'pin',       title: 'Chapters',         to: 'ManageChapters' },
  { key: 'members',     icon: 'users',     title: 'Members',          to: 'ManageMembers' },
  { key: 'restaurants', icon: 'clipboard', title: 'Partners',         to: 'ManageRestaurants' },
  { key: 'bnmap',       icon: 'pin',       title: 'BN map',           to: 'BNMap' },
  { key: 'broadcast',   icon: 'bell',      title: 'Org broadcast',    to: 'Broadcast' },
  { key: 'history',     icon: 'clipboard', title: 'Global history',   to: 'GlobalHistory' },
  { key: 'reports',     icon: 'clipboard', title: 'Export reports',   to: 'ExportReports' },
  { key: 'finance',     icon: 'gift',      title: 'Finance',          to: 'ExecFinance' },
  { key: 'metrics',     icon: 'star',      title: 'Impact metrics',   to: 'ExecMetrics' },
  { key: 'website',     icon: 'building',  title: 'Website content',  to: 'WebsiteContent' },
  { key: 'settings',    icon: 'settings',  title: 'Org settings',     to: 'Settings' },
];

function firstName(u) { return (u?.name || 'Exec').split(' ')[0]; }
function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Hi';
  if (h < 22) return 'Good evening,';
  return 'Hey';
}
function fmtMoney(n) { return `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`; }

// Pending-approval counts for the exec's "needs attention" card.
// Individual queries so a rule failure on one collection doesn't
// wipe the whole card.
async function fetchPendingCounts() {
  if (!isFirebaseConfigured) return { chapterApps: 0, joinRequests: 0, restaurants: 0 };
  const out = { chapterApps: 0, joinRequests: 0, restaurants: 0 };
  await Promise.all([
    getDocs(query(collection(db, 'chapter_applications'), where('status', '==', 'pending')))
      .then((s) => { out.chapterApps = s.size; }).catch(() => {}),
    getDocs(query(collection(db, 'chapter_join_requests'), where('status', '==', 'pending')))
      .then((s) => { out.joinRequests = s.size; }).catch(() => {}),
    getDocs(query(collection(db, 'restaurants'), where('status', '==', 'pending')))
      .then((s) => { out.restaurants = s.size; }).catch(() => {}),
  ]);
  return out;
}

export default function ExecutiveDashboard({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.signOut);
  const { isDesktop } = useBreakpoint();
  const [counts, setCounts] = useState({ chapters: 0, members: 0, partners: 0 });
  const [raised, setRaised] = useState(0);
  const [totalLbs, setTotalLbs] = useState(0);
  const [weekLbs, setWeekLbs] = useState(0);
  const [weekRuns, setWeekRuns] = useState(0);
  const [activeChapters, setActiveChapters] = useState(0);
  const [pending, setPending] = useState({ chapterApps: 0, joinRequests: 0, restaurants: 0 });

  const load = useCallback(async () => {
    try {
      const [chapters, members, restaurants, donations, metrics, weekDone, pend] = await Promise.all([
        fetchChapters(),
        fetchAllMembers(),
        fetchRestaurants(),
        fetchAllDonations(),
        fetchOrgMetrics({ scope: 'org' }),
        fetchRecentlyCompletedPickups({ hours: 24 * 7 }),
        fetchPendingCounts(),
      ]);
      setCounts({ chapters: chapters.length, members: members.length, partners: restaurants.length });
      setRaised(donations.reduce((s, d) => s + (d.amount || 0), 0));
      // All-time lbs — prefer the org metric, fall back to a legacy meals divide.
      const lbsMetric = metrics.find((m) => m.key === 'lbs_rescued_org')
        || metrics.find((m) => m.key === 'meals_rescued_org');
      if (lbsMetric) {
        const legacy = lbsMetric.key === 'meals_rescued_org';
        setTotalLbs(legacy ? Math.round(lbsMetric.value / 1.2) : lbsMetric.value);
      }
      // This week's pulse — chapter count with activity + lbs total
      const wLbs = weekDone.reduce((s, p) => s + (p.actual_weight_lbs || p.estimated_weight_lbs || 0), 0);
      setWeekLbs(Math.round(wLbs));
      setWeekRuns(weekDone.length);
      const activeSet = new Set(weekDone.map((p) => p.chapter_id).filter(Boolean));
      setActiveChapters(activeSet.size);
      setPending(pend);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSignOut() {
    const ok = await confirm('Sign Out', 'Sign out of the executive portal?');
    if (!ok) return;
    try { await signOut(); } catch {}
    clearAuth();
  }

  const totalPending = pending.chapterApps + pending.joinRequests + pending.restaurants;

  return (
    <ContractGate kind="executive">
    <Screen contentStyle={[styles.content, isDesktop && styles.contentDesktop]}>
      <ResponsiveContainer maxWidth={780}>
        <WorkspaceChip
          user={user}
          workspaceName="BetterNature National"
          scope="national"
        />
        <IdentityStrip
          eyebrow="Executive"
          greeting={timeOfDayGreeting()}
          name={firstName(user)}
          avatarInitial={(user?.name || '?')[0].toUpperCase()}
          onSignOut={handleSignOut}
        />

        <PulseHero
          weekLbs={weekLbs}
          weekRuns={weekRuns}
          activeChapters={activeChapters}
          totalChapters={counts.chapters}
        />

        {totalPending > 0 && (
          <PendingApprovalsCard
            pending={pending}
            onOpenChapters={() => navigation.navigate('ManageChapters')}
            onOpenPartners={() => navigation.navigate('ManageRestaurants')}
          />
        )}

        <KpiTrio
          raised={raised}
          totalLbs={totalLbs}
          members={counts.members}
        />

        <LiveOps navigation={navigation} />

        {user?.chapter_id && (
          <TouchableOpacity
            style={styles.chapterShortcut}
            onPress={() => navigation.navigate('PresidentDashboard')}
            activeOpacity={0.88}
          >
            <View style={styles.chapterShortcutIcon}>
              <Icon name="pin" size={16} color={Colors.green} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chapterShortcutTitle}>Also chapter president</Text>
              <Text style={styles.chapterShortcutBody}>Open the president view for your own chapter.</Text>
            </View>
            <Icon name="chevron" size={16} color={Colors.grayMid} />
          </TouchableOpacity>
        )}

        <ToolsGrid navigation={navigation} />
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
        <Text style={styles.greetingK}>{eyebrow}</Text>
        <Text style={styles.greetingT} numberOfLines={1}>{greeting} {name}</Text>
      </View>
      <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutTxt}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

function PulseHero({ weekLbs, weekRuns, activeChapters, totalChapters }) {
  const hasActivity = weekLbs > 0 || weekRuns > 0;
  const meals = mealsFromLbs(weekLbs);
  return (
    <View style={styles.pulseHero}>
      <Text style={styles.pulseEyebrow}>This week · org-wide</Text>
      {hasActivity ? (
        <>
          <Text style={styles.pulseNum}>
            {weekLbs.toLocaleString('en-US')}
            <Text style={styles.pulseNumUnit}> lbs rescued</Text>
          </Text>
          <Text style={styles.pulseBody}>
            <Text style={styles.pulseBodyEm}>{weekRuns} run{weekRuns === 1 ? '' : 's'}</Text>
            {meals > 0 ? ` · about ${meals.toLocaleString('en-US')} meals` : ''}
            {activeChapters > 0 && totalChapters > 0
              ? ` · ${activeChapters} of ${totalChapters} chapter${totalChapters === 1 ? '' : 's'} active`
              : ''}
            .
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.pulseNum}>Quiet week across the org.</Text>
          <Text style={styles.pulseBody}>
            {totalChapters > 0
              ? `${totalChapters} chapter${totalChapters === 1 ? '' : 's'} on the board and no completed runs yet — a broadcast might help.`
              : 'Approve the first chapter to get things moving.'}
          </Text>
        </>
      )}
    </View>
  );
}

function PendingApprovalsCard({ pending, onOpenChapters, onOpenPartners }) {
  const rows = [];
  if (pending.chapterApps > 0) {
    rows.push({
      key: 'ch-app',
      icon: 'pin',
      title: `${pending.chapterApps} chapter application${pending.chapterApps === 1 ? '' : 's'}`,
      body: 'Founders waiting on your green light.',
      onPress: onOpenChapters,
    });
  }
  if (pending.joinRequests > 0) {
    rows.push({
      key: 'jr',
      icon: 'users',
      title: `${pending.joinRequests} chapter join request${pending.joinRequests === 1 ? '' : 's'}`,
      body: 'Members asking to switch chapters.',
      onPress: onOpenChapters,
    });
  }
  if (pending.restaurants > 0) {
    rows.push({
      key: 'rest',
      icon: 'clipboard',
      title: `${pending.restaurants} partner application${pending.restaurants === 1 ? '' : 's'}`,
      body: 'Restaurants and community partners awaiting review.',
      onPress: onOpenPartners,
    });
  }
  if (rows.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>Needs your review</Text>
      <View style={{ marginTop: 6 }}>
        {rows.map((r, i) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.attnRow, i > 0 && styles.attnRowBorder]}
            onPress={r.onPress}
            activeOpacity={0.85}
          >
            <View style={styles.attnIcon}>
              <Icon name={r.icon} size={16} color={Colors.pink} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.attnTitle} numberOfLines={1}>{r.title}</Text>
              <Text style={styles.attnBody} numberOfLines={2}>{r.body}</Text>
            </View>
            <Icon name="chevron" size={16} color={Colors.grayMid} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Quiet KPI trio — money / lbs / members. No gradient banners; these
// numbers are informative, not the emotional beat of the screen.
function KpiTrio({ raised, totalLbs, members }) {
  return (
    <View style={styles.kpiRow}>
      <View style={styles.kpiCell}>
        <Text style={styles.kpiNum}>{fmtMoney(raised)}</Text>
        <Text style={styles.kpiLabel}>Raised · month</Text>
      </View>
      <View style={styles.kpiDiv} />
      <View style={styles.kpiCell}>
        <Text style={styles.kpiNum}>{(totalLbs || 0).toLocaleString('en-US')}</Text>
        <Text style={styles.kpiLabel}>Lbs · all-time</Text>
      </View>
      <View style={styles.kpiDiv} />
      <View style={styles.kpiCell}>
        <Text style={styles.kpiNum}>{(members || 0).toLocaleString('en-US')}</Text>
        <Text style={styles.kpiLabel}>Members</Text>
      </View>
    </View>
  );
}

function ToolsGrid({ navigation }) {
  return (
    <View style={styles.toolsCard}>
      <Text style={styles.cardEyebrow}>Executive tools</Text>
      <View style={styles.toolsGrid}>
        {TOOLS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={styles.toolItem}
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
  content: { padding: 20, paddingTop: 60, paddingBottom: 60, gap: 12 },
  contentDesktop: { paddingHorizontal: 40, maxWidth: 780, alignSelf: 'center', width: '100%' },

  idStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.cream, fontFamily: SERIF, fontSize: 16, fontWeight: '500' },
  greeting: { flex: 1, minWidth: 0 },
  greetingK: { fontSize: 11, color: Colors.pink, letterSpacing: 0.1, textTransform: 'uppercase', fontWeight: '700' },
  greetingT: { fontSize: 16, fontWeight: '600', color: Colors.dark, marginTop: 1 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutTxt: { fontSize: 13, color: Colors.pink, fontWeight: '600' },

  pulseHero: {
    backgroundColor: Colors.green,
    borderRadius: 22, padding: 22, marginTop: 6, gap: 8,
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
  attnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  attnRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.glassBorder },
  attnIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#FDF0F3',
    alignItems: 'center', justifyContent: 'center',
  },
  attnTitle: { fontSize: 14, fontWeight: '600', color: Colors.dark },
  attnBody: { fontSize: 12.5, color: Colors.gray, marginTop: 2 },

  kpiRow: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.glassBorder,
    padding: 16, flexDirection: 'row', alignItems: 'center',
  },
  kpiCell: { flex: 1, alignItems: 'center' },
  kpiNum: {
    fontFamily: SERIF, fontSize: 24, lineHeight: 26,
    color: Colors.dark, fontWeight: '500', letterSpacing: -0.3,
  },
  kpiLabel: {
    fontSize: 10.5, fontWeight: '600', color: Colors.gray,
    marginTop: 6, letterSpacing: 0.3, textAlign: 'center',
    textTransform: 'uppercase',
  },
  kpiDiv: { width: 1, height: 30, backgroundColor: Colors.glassBorder },

  chapterShortcut: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  chapterShortcutIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  chapterShortcutTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark },
  chapterShortcutBody: { fontSize: 12.5, color: Colors.gray, marginTop: 2 },

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
    minWidth: '30%',
    flexGrow: 1,
  },
  toolIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  toolLabel: { fontSize: 13, fontWeight: '600', color: Colors.dark, flex: 1 },
});
