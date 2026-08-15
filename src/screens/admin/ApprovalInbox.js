// Approval Inbox — Phase 2 slice 1.
//
// Unified queue of everything an exec / chapter president needs to
// review. Blueprint §31 "Approval Inbox" screen. Consolidates:
//
//   - Chapter applications        (chapter_applications, status:pending)
//   - Chapter join / switch req.  (chapter_join_requests, status:pending)
//   - Partner applications        (restaurants, status:pending)
//   - Handoff-unverified pickups  (pickups, handoff_unverified:true)
//
// Each row deep-links to the existing action surface (ManageChapters
// for chapter apps + joins, ManageRestaurants for partners,
// PickupDetail for the pickup flag). This isn't a NEW approval
// system — it's the missing "one place to see everything" that
// unblocks execs from having to scroll through multiple admin
// screens looking for pending work.
//
// Scoping: an exec sees everything org-wide. A chapter president
// sees only items scoped to their chapter (chapter_join_requests
// where to_chapter_id == their chapter_id; pickups where chapter_id
// == theirs).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../config/firebase';
import { Colors, Type, Radius, Shadows } from '../../config/theme';
import Screen from '../../components/ui/Screen';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import Icon from '../../components/ui/Icon';
import useAuthStore from '../../store/authStore';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import { hasRole } from '../../services/roles';
import { isFounderEmail } from '../../services/founder';

const SERIF = Platform.select({
  ios: 'Georgia', android: 'serif',
  default: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
});

// Pull each queue in parallel. Every fetch is best-effort — if one
// collection's rules haven't deployed or the query fails, the inbox
// still renders the other categories.
async function loadQueues({ chapterScope = null } = {}) {
  if (!isFirebaseConfigured) {
    return { chapterApps: [], joinRequests: [], partnerApps: [], unverifiedPickups: [] };
  }
  const [chapterApps, joinRequests, partnerApps, unverifiedPickups] = await Promise.all([
    getDocs(query(collection(db, 'chapter_applications'), where('status', '==', 'pending')))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
      .catch(() => []),
    getDocs(query(collection(db, 'chapter_join_requests'), where('status', '==', 'pending')))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
      .then((rows) => chapterScope
        ? rows.filter((r) => r.to_chapter_id === chapterScope)
        : rows)
      .catch(() => []),
    getDocs(query(collection(db, 'restaurants'), where('status', '==', 'pending')))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
      .then((rows) => chapterScope
        ? rows.filter((r) => r.chapter_id === chapterScope)
        : rows)
      .catch(() => []),
    // Handoff-unverified is a flag not a status — client-side filter
    // is the only reliable path without composite indexes.
    getDocs(query(collection(db, 'pickups'), where('status', '==', 'completed')))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
      .then((rows) => rows
        .filter((p) => p.handoff_unverified === true)
        .filter((p) => !chapterScope || p.chapter_id === chapterScope))
      .catch(() => []),
  ]);
  return { chapterApps, joinRequests, partnerApps, unverifiedPickups };
}

export default function ApprovalInbox({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { contentStyle } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [queues, setQueues] = useState({
    chapterApps: [], joinRequests: [], partnerApps: [], unverifiedPickups: [],
  });

  // Scope: exec/admin/super_admin/founder → org-wide (null scope).
  // Anyone else with an approval-qualifying role → their chapter only.
  const isOrgWide = hasRole(user, ['executive', 'admin', 'super_admin']) || isFounderEmail(user?.email);
  const chapterScope = isOrgWide ? null : (user?.chapter_id || null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadQueues({ chapterScope });
      setQueues(next);
    } catch {}
    setLoading(false);
  }, [chapterScope]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalItems = useMemo(() =>
    queues.chapterApps.length + queues.joinRequests.length
    + queues.partnerApps.length + queues.unverifiedPickups.length
  , [queues]);

  return (
    <Screen contentStyle={contentStyle}>
      <ResponsiveContainer maxWidth={760}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} activeOpacity={0.85}>
          <Icon name="back" size={16} color={Colors.green} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>Approval Inbox</Text>
        <Text style={styles.title}>
          {isOrgWide ? 'Everything org-wide that needs your review.' : 'Your chapter\'s pending queue.'}
        </Text>
        <Text style={styles.lead}>
          One list, no more digging through five admin screens. Tap a row to open the
          action surface where you approve or deny.
        </Text>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={Colors.green} />
          </View>
        ) : totalItems === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Section
              label="Chapter applications"
              count={queues.chapterApps.length}
              rows={queues.chapterApps.map((a) => ({
                key: `ca-${a.id}`,
                title: a.proposed_name || `BetterNature ${a.city || 'new chapter'}`,
                body: `Applicant: ${a.applicant_name || a.applicant_email || 'unknown'} · ${a.city || ''}${a.state ? ', ' + a.state : ''}`,
                icon: 'pin',
                onPress: () => navigation.navigate('ManageChapters'),
              }))}
            />
            <Section
              label="Chapter join / switch requests"
              count={queues.joinRequests.length}
              rows={queues.joinRequests.map((r) => ({
                key: `jr-${r.id}`,
                title: `${r.user_name || 'A member'} → ${r.to_chapter_name || 'a chapter'}`,
                body: r.reason ? `Reason: ${r.reason}` : 'Requested to join / switch',
                icon: 'users',
                onPress: () => navigation.navigate('ManageChapters'),
              }))}
            />
            <Section
              label="Partner applications"
              count={queues.partnerApps.length}
              rows={queues.partnerApps.map((r) => ({
                key: `pa-${r.id}`,
                title: r.name || 'Unnamed partner',
                body: `${(r.partner_type || 'partner').replace(/_/g, ' ')} · ${r.city || ''}${r.state ? ', ' + r.state : ''} · ${r.email || 'no email'}`,
                icon: 'clipboard',
                onPress: () => navigation.navigate('ManageRestaurants'),
              }))}
            />
            <Section
              label="Unverified handoffs"
              count={queues.unverifiedPickups.length}
              tone="warn"
              rows={queues.unverifiedPickups.map((p) => ({
                key: `up-${p.id}`,
                title: `${p.restaurant_name || 'A restaurant'} · ${p.actual_weight_lbs || p.estimated_weight_lbs || '?'} lbs`,
                body: p.handoff_unverified_note
                  ? `Volunteer attested: "${p.handoff_unverified_note}"`
                  : 'Volunteer marked delivered without restaurant confirmation.',
                icon: 'alert',
                onPress: () => navigation.navigate('PickupDetail', { pickupId: p.id, pickup: p }),
              }))}
            />
          </>
        )}
      </ResponsiveContainer>
    </Screen>
  );
}

function Section({ label, count, rows, tone = 'calm' }) {
  if (!rows || rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, tone === 'warn' && styles.sectionLabelWarn]}>
          {label}
        </Text>
        <View style={[styles.countPill, tone === 'warn' && styles.countPillWarn]}>
          <Text style={[styles.countPillText, tone === 'warn' && styles.countPillTextWarn]}>{count}</Text>
        </View>
      </View>
      {rows.map((r) => (
        <TouchableOpacity key={r.key} style={styles.row} onPress={r.onPress} activeOpacity={0.85}>
          <View style={[styles.rowIcon, tone === 'warn' && styles.rowIconWarn]}>
            <Icon name={r.icon} size={16} color={tone === 'warn' ? '#8E1B1B' : Colors.green} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
            <Text style={styles.rowBody} numberOfLines={2}>{r.body}</Text>
          </View>
          <Icon name="chevron" size={16} color={Colors.grayMid} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="check" size={22} color={Colors.green} strokeWidth={2.25} />
      </View>
      <Text style={styles.emptyTitle}>Inbox zero.</Text>
      <Text style={styles.emptyBody}>
        Nothing pending — every chapter application, join request, partner sign-up, and
        unverified handoff has been reviewed. You'll see new items here as they land.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: Colors.green, fontWeight: '600' },
  eyebrow: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase', color: Colors.green, marginTop: 10,
  },
  title: {
    fontFamily: SERIF, fontSize: 26, lineHeight: 32,
    fontWeight: '500', letterSpacing: -0.2, color: Colors.dark, marginTop: 4,
  },
  lead: { fontSize: 14.5, color: Colors.gray, marginTop: 6, marginBottom: 20, lineHeight: 21 },
  loader: { padding: 40, alignItems: 'center' },

  section: { marginBottom: 20 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', letterSpacing: 1.3,
    textTransform: 'uppercase', color: Colors.green,
  },
  sectionLabelWarn: { color: '#8E1B1B' },
  countPill: {
    minWidth: 22, height: 22, borderRadius: 11,
    paddingHorizontal: 8,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  countPillText: { fontSize: 11, fontWeight: '800', color: Colors.green },
  countPillWarn: { backgroundColor: '#FCE3E3' },
  countPillTextWarn: { color: '#8E1B1B' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconWarn: { backgroundColor: '#FCE3E3' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.dark },
  rowBody: { fontSize: 12.5, color: Colors.gray, marginTop: 2, lineHeight: 17 },

  empty: {
    backgroundColor: Colors.white,
    borderRadius: 18, padding: 26,
    borderWidth: 1, borderColor: Colors.glassBorder,
    alignItems: 'flex-start', gap: 10,
  },
  emptyIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: SERIF, fontSize: 22, color: Colors.dark, fontWeight: '500', marginTop: 4 },
  emptyBody: { fontSize: 14, color: Colors.gray, lineHeight: 20 },
});
